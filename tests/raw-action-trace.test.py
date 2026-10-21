import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import h5py
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

spec = importlib.util.spec_from_file_location("reader", Path(__file__).parents[1] / "scripts/read-raw-action-trace.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class RawTraceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="raw-action-test-")
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "trajectory.hdf5"
        self.request = {"format": "hdf5", "episodeId": "a" * 64, "originalEpisodeId": "original", "taskName": "task",
                        "manifestSha256": "b" * 64, "bindingSha256": "c" * 64, "videoFrames": 100, "videoDuration": 2.0}
        with h5py.File(self.path, "w") as h:
            h[reader.CLOCK] = np.arange(100) / 50
            h.attrs["episode_id"] = "original"
            h.attrs["task_name"] = "task"
            for name, key in reader.H5_FIELDS.items():
                h[key] = np.arange(100 * (6 if name.endswith("joint") else 7)).reshape(100, -1) / 1000

    def extract(self):
        with self.path.open("rb") as h:
            return reader.extract(h, self.request)

    def test_real_hdf5_values_and_video_clock(self):
        trace = self.extract()
        self.assertEqual(trace["clock"]["sourceFrames"], 100)
        self.assertEqual(trace["clock"]["samples"], 80)
        self.assertAlmostEqual(trace["t"][-1], 1.98)
        self.assertEqual(trace["jointPosition"]["left"][-1], [0.594, 0.595, 0.596, 0.597, 0.598, 0.599])
        self.assertEqual(trace["endEffectorPosition"]["right"][-1], [0.693, 0.694, 0.695])
        self.assertIsNone(trace["provenance"]["trajectorySha256"])

    def test_missing_joint_is_null_and_not_faked(self):
        with h5py.File(self.path, "a") as h:
            del h[reader.H5_FIELDS["left_joint"]]
        trace = self.extract()
        self.assertIsNone(trace["jointPosition"]["left"])
        self.assertIsNotNone(trace["endEffectorPosition"]["left"])

    def test_missing_video_clock_is_not_replaced_by_sim_clock(self):
        with h5py.File(self.path, "a") as h:
            del h[reader.CLOCK]
            h["timeline/sim_time_seconds"] = np.arange(100)
        with self.assertRaisesRegex(ValueError, "video_clock_missing"):
            self.extract()

    def test_invalid_clock_rejected(self):
        with h5py.File(self.path, "a") as h:
            h[reader.CLOCK][10] = 0
        with self.assertRaisesRegex(ValueError, "invalid_video_clock"):
            self.extract()

    def test_non_finite_and_misaligned_arrays_rejected(self):
        with h5py.File(self.path, "a") as h:
            h[reader.H5_FIELDS["right_ee"]][0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "non_finite_trace"):
            self.extract()
        with h5py.File(self.path, "a") as h:
            del h[reader.H5_FIELDS["right_ee"]]
            h[reader.H5_FIELDS["right_ee"]] = np.zeros((99, 7))
        with self.assertRaisesRegex(ValueError, "unaligned_trace_arrays"):
            self.extract()

    def test_metadata_identity_and_video_length_rejected(self):
        self.request["originalEpisodeId"] = "another"
        with self.assertRaisesRegex(ValueError, "source_identity_mismatch"):
            self.extract()
        self.request["originalEpisodeId"] = "original"
        self.request["videoFrames"] = 99
        with self.assertRaisesRegex(ValueError, "video_frame_count_mismatch"):
            self.extract()
        self.request["videoFrames"] = 100
        self.request["videoDuration"] = 20
        with self.assertRaisesRegex(ValueError, "video_duration_mismatch"):
            self.extract()

    def official(self, **replace):
        self.path = self.path.with_suffix(".parquet")
        self.request.update(format="parquet", officialState20D=True, sourceFrames=100, fps=25, videoDuration=4)
        values = {"timestamp": np.arange(100) / 25, "observation.state": [[float(k) for k in range(20)] for _ in range(100)],
                  "action": [[999.0] * 20 for _ in range(100)], "episode_id": ["original"] * 100,
                  "task": ["task"] * 100, "frame_index": list(range(100))}
        values.update(replace)
        pq.write_table(pa.table(values), self.path)

    def test_official_real_ee_and_no_invented_joints_or_action(self):
        self.official()
        trace = self.extract()
        self.assertEqual(trace["endEffectorPosition"]["left"][0], [0, 1, 2])
        self.assertEqual(trace["endEffectorPosition"]["right"][0], [10, 11, 12])
        self.assertIsNone(trace["jointPosition"]["left"])
        self.assertIsNone(trace["jointPosition"]["right"])
        self.assertEqual(trace["clock"]["dataset"], "timestamp")
        self.assertEqual(trace["endEffectorPosition"]["frame"], "source")

    def test_official_source_contract_required(self):
        self.official()
        self.request["officialState20D"] = False
        with self.assertRaisesRegex(ValueError, "unsupported_parquet_contract"):
            self.extract()

    def test_official_episode_and_task_identity_rejected(self):
        self.official(task=["another"] * 100)
        with self.assertRaisesRegex(ValueError, "source_identity_mismatch"):
            self.extract()

    def test_official_clock_and_state_shape_rejected(self):
        self.official()
        self.request["fps"] = 50
        with self.assertRaisesRegex(ValueError, "official_video_clock_mismatch"):
            self.extract()
        self.official(**{"observation.state": [[0.0] * 16 for _ in range(100)]})
        with self.assertRaisesRegex(ValueError, "unsupported_state_dimensions"):
            self.extract()

    def test_official_index_and_count_rejected(self):
        self.official(frame_index=list(range(1, 101)))
        with self.assertRaisesRegex(ValueError, "frame_index_mismatch"):
            self.extract()
        self.official()
        self.request["sourceFrames"] = 99
        with self.assertRaisesRegex(ValueError, "official_frame_count_mismatch"):
            self.extract()


if __name__ == "__main__":
    unittest.main()
