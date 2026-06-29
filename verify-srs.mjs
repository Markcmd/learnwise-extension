import { defaultSrs, normalizeSrs, clampEase, seedReview, schedule, isDue, dueWords, gradeWord, countDue } from "./JSs/core/srs.js";
import { LEITNER } from "./JSs/core/constants.js";
import { createWordRecord } from "./JSs/core/wordbank.js";

const DAY = 24*60*60*1000, NOW = 1_000_000_000_000;
let pass=0, fail=0;
function eq(name, got, want){ const g=JSON.stringify(got), w=JSON.stringify(want); if(g===w){pass++;} else {fail++; console.log("FAIL "+name+"\n  got "+g+"\n  want "+w);} }
function ok(name, cond){ if(cond){pass++;} else {fail++; console.log("FAIL "+name);} }

// defaults
eq("defaultSrs", defaultSrs(), {box:1,ease:2.5,interval:0,reps:0,nextReviewAt:0,lastResult:null,lastReviewedAt:0});
ok("norm box max", normalizeSrs({box:99,ease:9}).box===LEITNER.BOXES);
ok("norm ease max", normalizeSrs({box:99,ease:9}).ease===LEITNER.MAX_EASE);
ok("norm box min", normalizeSrs({box:0,ease:0.1}).box===1);
ok("norm ease min", normalizeSrs({box:0,ease:0.1}).ease===LEITNER.MIN_EASE);
ok("clampEase mid", clampEase(2.5)===2.5);
ok("clampEase hi", clampEase(99)===LEITNER.MAX_EASE);
ok("clampEase lo", clampEase(-1)===LEITNER.MIN_EASE);

// seed
const sd = seedReview(defaultSrs(), NOW);
ok("seed box", sd.box===1);
ok("seed interval", sd.interval===LEITNER.INTERVALS_DAYS[1]);
ok("seed next", sd.nextReviewAt===NOW+LEITNER.INTERVALS_DAYS[1]*DAY);
ok("seed reps", sd.reps===0);
ok("seed lastReviewed", sd.lastReviewedAt===0);
const inp=defaultSrs(); seedReview(inp,NOW); ok("seed no mutate", inp.nextReviewAt===0);

// good
const g = schedule(defaultSrs(),"good",NOW);
eq("good", [g.box,g.interval,g.ease,g.reps,g.lastResult,g.lastReviewedAt,g.nextReviewAt],[2,3,2.5,1,"good",NOW,NOW+3*DAY]);
let s=defaultSrs(); const ladder=[]; for(let i=0;i<6;i++){s=schedule(s,"good",NOW);ladder.push([s.box,s.interval]);}
eq("good ladder", ladder, [[2,3],[3,7],[4,16],[5,35],[5,35],[5,35]]);

// easy
const e = schedule(defaultSrs(),"easy",NOW);
ok("easy box", e.box===3);
ok("easy ease", Math.abs(e.ease-2.65)<1e-9);
ok("easy interval", e.interval===7);
ok("easy>good", e.interval>schedule(defaultSrs(),"good",NOW).interval);
ok("easy reps", e.reps===1);

// hard
const h = schedule({...defaultSrs(),box:3,ease:2.5},"hard",NOW);
ok("hard box", h.box===3);
ok("hard ease", Math.abs(h.ease-2.35)<1e-9);
ok("hard interval", h.interval===4);
ok("hard next", h.nextReviewAt===NOW+4*DAY);
ok("hard box1 min", schedule(defaultSrs(),"hard",NOW).interval===1);

// again
const a = schedule({...defaultSrs(),box:4,ease:2.5,reps:7},"again",NOW);
eq("again", [a.box,a.reps,a.interval,a.nextReviewAt,a.lastResult],[1,0,0,NOW,"again"]);
ok("again ease", Math.abs(a.ease-2.3)<1e-9);

// clamp via repetition
let af=defaultSrs(); for(let i=0;i<20;i++) af=schedule(af,"again",NOW); ok("again floor ease", af.ease===LEITNER.MIN_EASE);
let ec=defaultSrs(); for(let i=0;i<20;i++) ec=schedule(ec,"easy",NOW); ok("easy cap ease", ec.ease===LEITNER.MAX_EASE);

// no mutate + throw
const im=defaultSrs(); schedule(im,"good",NOW); eq("schedule no mutate", im, defaultSrs());
let threw=false; try{schedule(defaultSrs(),"nope",NOW);}catch(_){threw=true;} ok("throw unknown grade", threw);

// isDue
ok("notDue fresh", isDue(defaultSrs(),NOW)===false);
ok("due before", isDue(sd,sd.nextReviewAt-1)===false);
ok("due at", isDue(sd,sd.nextReviewAt)===true);
ok("due after", isDue(sd,sd.nextReviewAt+DAY)===true);

// dueWords/countDue
const bank={a:createWordRecord("a",{},NOW),b:createWordRecord("b",{},NOW),c:createWordRecord("c",{},NOW),d:createWordRecord("d",{},NOW)};
bank.a.srs={...defaultSrs(),nextReviewAt:NOW-5*DAY,reps:1};
bank.b.srs={...defaultSrs(),nextReviewAt:NOW-1*DAY,reps:1};
bank.c.srs={...defaultSrs(),nextReviewAt:NOW+1*DAY,reps:1};
bank.d.srs=defaultSrs();
eq("dueWords", dueWords(bank,NOW), ["a","b"]);
ok("countDue", countDue(bank,NOW)===2);

// gradeWord
const b2={cat:createWordRecord("cat",{},NOW-DAY)}; b2.cat.srs=seedReview(defaultSrs(),NOW-DAY);
gradeWord(b2,"cat","good",NOW);
ok("gradeWord box", b2.cat.srs.box===2);
ok("gradeWord result", b2.cat.srs.lastResult==="good");
ok("gradeWord reviewedAt", b2.cat.srs.lastReviewedAt===NOW);
ok("gradeWord updatedAt", b2.cat.updatedAt===NOW);
const b3={}; ok("gradeWord untracked", gradeWord(b3,"ghost","good",NOW)===b3 && b3.ghost===undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
