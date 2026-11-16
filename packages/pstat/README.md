# @openstage/pstat

Read, write and check `.pstat` project files: format 1, spec revision 1.1 ([PSTAT-1](../../specs/pstat/PSTAT-1.md)).
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
