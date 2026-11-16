# @openstage/pstat

Read, write and check `.pstat` project files: format 1, spec revision 1.2 ([PSTAT-1](https://github.com/jasonswrench-beep/openstage-core/blob/main/specs/pstat/PSTAT-1.md)).

```bash
npm install --save-dev https://github.com/jasonswrench-beep/openstage-core/releases/download/pstat-v1.2.0/openstage-pstat-1.2.0.tgz
```
No dependencies; Node 22.2 or later.

```js
import { checkPstat, readPart, readPstat, writePstat } from "@openstage/pstat";

const bytes = writePstat(project, part); // part: the profile's part (assessment.json, case-table.json), if it has one
checkPstat(bytes); // [] when every writer rule holds, the profile's layout and its part among them
readPstat(bytes); // project.json, or a PstatError naming the rule PrismStatistics would refuse it under
readPart(bytes); // the profile's part, parsed, or null
```

`pointsFor`, `entryFor` and `isAnswer` follow the scoring rule of profile `OpenAssess item results 2` (section 7.2);
`attributeName` and `attributeNames` make variable names as profile `PrismQDA case table 1` says (section 7.3).
Types are in `src/index.d.ts`. Run the tests with `npm test`.
