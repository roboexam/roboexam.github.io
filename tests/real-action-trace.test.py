import importlib.util
from pathlib import Path
import tempfile
import unittest

import pyarrow as pa
import pyarrow.parquet as pq

spec = importlib.util.spec_from_file_location(
    "reader", Path(__file__).parents[1] / "scripts/read-real-action-trace.py"
)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class RealActionTraceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="real-action-test-")
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "episode.parquet"
        self.request = {
            "format": "lerobot-v3", "datasetKind": "robot", "datasetId": "a" * 64,
            "episodeId": "b" * 64, "episodeIndex": 3, "manifestSha256": "c" * 64,
            "bindingSha256": "d" * 64, "sourceFrames": 100, "durationSeconds": 4,
        }

    def extract(self):
        with self.path.open("rb") as handle:
            return reader.extract(handle, self.request)

    def write_v3(self):
        rows = 100
        values = {
            "episode_index": [3] * rows,
            "frame_index": list(range(rows)),
            "timestamp": [index / 25 for index in range(rows)],
        }
        for key in reader.V3.values():
            width = 7
            values[key] = [[index + offset / 10 for offset in range(width)] for index in range(rows)]
        pq.write_table(pa.table(values), self.path)

    def test_v3_replays_command_joint_and_end_effector_channels(self):
        self.write_v3()
        trace = self.extract()
        self.assertEqual(trace["clock"]["sourceFrames"], 100)
        self.assertEqual(trace["clock"]["samples"], 80)
        self.assertEqual(trace["t"][-1], 4)
        self.assertEqual(trace["jointPosition"]["left"][0], [0, .1, .2, .3, .4, .5])
        self.assertEqual(trace["endEffectorPosition"]["right"][-1], [99, 99.1, 99.2])
        self.assertEqual(trace["action"]["labels"][-1], "Grip")
        self.assertEqual(trace["provenance"]["bindingMethod"], "real_parquet_identity")

    def test_v2_uses_valid_delta_pose_actions_and_wrist_state(self):
        rows = 90
        self.request.update(format="lerobot-v2", datasetKind="ego", episodeIndex=7,
                            sourceFrames=rows, durationSeconds=3)
        values = {
            "episode_index": [7] * rows,
            "frame_index": list(range(rows)),
            "timestamp": [index / 30 for index in range(rows)],
            "action": [[float(offset) for offset in range(14)] for _ in range(rows)],
            "action.valid": [False] + [True] * (rows - 1),
            "observation.state.left_wrist_pose": [[float(index + 1), 2., 3., 1., 0., 0., 0.] for index in range(rows)],
            "observation.state.right_wrist_pose": [[float(index + 4), 5., 6., 1., 0., 0., 0.] for index in range(rows)],
        }
        pq.write_table(pa.table(values), self.path)
        trace = self.extract()
        self.assertEqual(trace["t"][0], 0)
        self.assertEqual(trace["t"][-1], 3)
        self.assertGreater(trace["action"]["t"][0], 0)
        self.assertEqual(trace["action"]["left"][0], [0, 1, 2, 3, 4, 5, 6])
        self.assertEqual(trace["action"]["right"][0], [7, 8, 9, 10, 11, 12, 13])
        self.assertEqual(trace["endEffectorPosition"]["right"][0], [4, 5, 6])
        self.assertIsNone(trace["jointPosition"]["left"])

    def test_episode_identity_and_frame_count_are_enforced(self):
        self.write_v3()
        self.request["episodeIndex"] = 9
        with self.assertRaisesRegex(ValueError, "episode_not_found"):
            self.extract()
        self.request["episodeIndex"] = 3
        self.request["sourceFrames"] = 99
        with self.assertRaisesRegex(ValueError, "source_frame_count_mismatch"):
            self.extract()


if __name__ == "__main__":
    unittest.main()
