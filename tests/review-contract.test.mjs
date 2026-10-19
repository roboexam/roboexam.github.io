import test from "node:test";
import assert from "node:assert/strict";
import { assertReviewCandidate, reviewMediaRoot } from "../scripts/review-contract.mjs";
import { filterReviewEpisodes } from "../app/data/review-filters.ts";
const clean = () => ({ qualification: { functional:true, clean:true, strongFidelity:false },
  checks:{clean_selector_passed:true}, machineStatus:"clean_selected", memberships:[] });
test("clean, engineering, and missing acceptance remain distinct", () => {
  assert.doesNotThrow(() => assertReviewCandidate(clean()));
  const bad=clean(); bad.checks.clean_selector_passed=false;
  assert.throws(() => assertReviewCandidate(bad));
  assert.throws(() => assertReviewCandidate({...clean(),qualification:{...clean().qualification,clean:false}}));
  const technical={...clean(),qualification:{functional:true,clean:null,strongFidelity:null},
    checks:{clean_selector_passed:false},machineStatus:"technical_pass_purpose_pending",evidence:[{sha256:"a".repeat(64)}]};
  assert.doesNotThrow(() => assertReviewCandidate(technical));
  assert.throws(() => assertReviewCandidate({...technical,evidence:[]}));
  assert.throws(() => reviewMediaRoot("../staging"));
  assert.throws(() => reviewMediaRoot("remote"));
  assert.match(reviewMediaRoot("review-cache"),/runtime\/caches\//);
});
test("new/backup batches and development memberships cannot cross-match", () => {
  const rows=[{...clean(),id:"new",memberships:[{batch:"round2",role:"primary",family:"ID",program:"p1"}]},
    {...clean(),id:"old",memberships:[{batch:"round1",role:"backup",family:"ID",program:"p1"}]},
    {...clean(),id:"both",memberships:[{batch:"x",role:"primary",family:"ID"},{batch:"y",role:"development",family:"ID"}]}];
  const filter={batch:"",role:"backup",family:"",machine:""};
  assert.deepEqual(filterReviewEpisodes(rows,filter).map(x=>x.id),["old"]);
  assert.deepEqual(filterReviewEpisodes(rows,{...filter,batch:"x",role:"development"}),[]);
  assert.deepEqual(filterReviewEpisodes(rows,{...filter,batch:"y",role:"development"}).map(x=>x.id),["both"]);
});

test("distribution and purpose are independent and filters preserve both", () => {
  const rows = [
    {...clean(),id:"id",memberships:[{batch:"v1",role:"primary",family:"ID"}]},
    {...clean(),id:"ood",memberships:[{batch:"v1",role:"validation",family:"Semantic OOD"}]},
    {...clean(),id:"rec",qualification:{functional:true,clean:null,strongFidelity:null},
      machineStatus:"technical_pass_purpose_pending",memberships:[{batch:"v1",role:"validation",family:"REC"}]},
  ];
  const filters={batch:"",role:"",family:"Semantic OOD",machine:"clean_selected"};
  assert.deepEqual(filterReviewEpisodes(rows,filters).map(x=>x.id),["ood"]);
  assert.deepEqual(filterReviewEpisodes(rows,{...filters,family:"REC"}),[]);
  assert.deepEqual(filterReviewEpisodes(rows,{...filters,family:"REC",machine:"technical_pass_purpose_pending"}).map(x=>x.id),["rec"]);
  assert.throws(()=>assertReviewCandidate({...clean(),memberships:[{batch:"v1",role:"primary",family:"unknown"}]}));
});
