# Personal retrieval evidence v1

`corpus-v1.json` freezes 58 cases: 12 positive cases for each of source segments,
highlights (including written notes), and reflections; six mixed-scope cases;
eight abstention cases; eight authorization/deletion/revocation exclusions.
Each positive class includes four quotation cases, four distractor cases, and four
semantic paraphrases. IDs remain stable for baseline/candidate comparison.

The budget and quality thresholds come from the user-approved #136 design. The
manifest records that existing approval basis and delegated implementation
authority; it does not claim a new approval message. Candidate evidence must
record an actual tokenizer, model/provider/prompt configuration, three raw model
runs, per-class/per-run floors, and quality results before declaring that gate
passed.

`baseline-v1.json` is an **executed structural baseline**, not model-quality or
real-database evidence. It invokes the unchanged `6bfdb99` Notes and Library route
implementations. Authentication/database/provider doubles isolate route behavior;
source matches are supplied by the fixture and ownership filtering is simulated.
It records tables/RPCs queried, supplied highlight IDs, complete stored text
presence, quote clipping, and unsupported typed scopes. All semantic quality,
model abstention, and evidence-token measurements remain null. An excluded record
absent from these mock results is not proof of database authorization.

The first-page boundary is modeled by sending the legacy client only its visible
highlight IDs. The database runner must independently materialize the declared
1,001 distractors per personal class, then prove older matching records remain
eligible. This baseline does not claim that database-cap test ran.

Reproduce only from a checkout at the recorded baseline application commit, with
these fixture/harness files copied in, using:

```
node scripts/run-personal-retrieval-baseline.mjs
```

The harness verifies the application files equal that commit before running. It
writes the record only when explicitly invoked; ordinary CI runs validate corpus
integrity and skip the historical execution. Candidate code must not overwrite
the historical baseline or relabel structural observations as model results.
