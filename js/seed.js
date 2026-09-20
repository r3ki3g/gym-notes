// Exercise pool seeded from the WhatsApp log (08/27/26 – 09/15/26).
// `muscles` is ORDERED — index 0 is the dominant one, which drives search rank.
// Edit or delete any of these in the Pool tab; this only runs once, on an empty DB.

const B  = ['block'];
const KL = ['kg', 'lb'];

export const SEED_PROFILES = ['Prabhashwara', 'Chamuth'];

export const SEED_EXERCISES = [
  // ---- back ----
  { name:'Lat pull down (new machine)', muscles:['lats','biceps','rear delts'], allowedUnits:B, defaultUnit:'block', aliases:['pulldown','normal lateral pull down'] },
  { name:'Lat pull down (old machine)', muscles:['lats','biceps','rear delts'], allowedUnits:B, defaultUnit:'block', aliases:['pulldown'] },
  { name:'Single arm lat pulldown', muscles:['lats','biceps'], allowedUnits:B, defaultUnit:'block', unilateralDefault:true, aliases:['double arm lat pulldown'] },
  { name:'Seated row', muscles:['rhomboids','lats','biceps'], allowedUnits:B, defaultUnit:'block' },
  { name:'Seated cable row (one arm)', muscles:['rhomboids','lats','biceps'], allowedUnits:B, defaultUnit:'block', unilateralDefault:true, aliases:['single arm seated row'] },
  { name:'Chest supported row', muscles:['rhomboids','lats','rear delts'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true, aliases:['chest support rowing'] },
  { name:'Chest supported back machine (LBS stack)', muscles:['rhomboids','lats','rear delts'], allowedUnits:B, defaultUnit:'block', aliases:['they supported back machine','lvs'] },
  { name:'Lower back machine', muscles:['lower back','glutes'], allowedUnits:B, defaultUnit:'block' },

  // ---- chest ----
  { name:'Chest cable machine (fly)', muscles:['mid chest','front delts'], allowedUnits:B, defaultUnit:'block', aliases:['cheat cabel machine','tfw chest cable'] },
  { name:'Flat bench press', muscles:['mid chest','front delts','triceps'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true },
  { name:'Incline dumbbell press', muscles:['upper chest','front delts','triceps'], allowedUnits:KL, defaultUnit:'kg', aliases:['incline db press'] },
  { name:'Flat dumbbell press', muscles:['mid chest','front delts','triceps'], allowedUnits:KL, defaultUnit:'lb', aliases:['flat db press'] },
  { name:'Incline chest machine', muscles:['upper chest','front delts','triceps'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true },

  // ---- triceps ----
  { name:'Overhead tricep extension (dumbbell)', muscles:['triceps'], allowedUnits:KL, defaultUnit:'lb', aliases:['db overhead tricep'] },
  { name:'Overhead tricep extension (cable)', muscles:['triceps'], allowedUnits:B, defaultUnit:'block' },
  { name:'Overhead tricep extension (rope)', muscles:['triceps'], allowedUnits:B, defaultUnit:'block', aliases:['cable machine rope over head'] },
  { name:'Tricep extension machine', muscles:['triceps'], allowedUnits:B, defaultUnit:'block' },
  { name:'Tricep extension (cable, rotating bar)', muscles:['triceps'], allowedUnits:B, defaultUnit:'block', aliases:['near mirror'] },
  { name:'Tricep extension (rope)', muscles:['triceps'], allowedUnits:B, defaultUnit:'block', aliases:['cabel machine rope tricep'] },

  // ---- shoulders ----
  { name:'Overhead press', muscles:['front delts','side delts','triceps'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true, aliases:['ohp','shoulder press'] },
  { name:'Egyptian lateral raise', muscles:['side delts'], allowedUnits:B, defaultUnit:'block', unilateralDefault:true },
  { name:'Dumbbell lateral raise', muscles:['side delts'], allowedUnits:KL, defaultUnit:'lb', unilateralDefault:true, aliases:['db lateral raises'] },
  { name:'Dumbbell front raise', muscles:['front delts'], allowedUnits:KL, defaultUnit:'lb', unilateralDefault:true, aliases:['db front raises'] },
  { name:'Shrugs (dumbbell)', muscles:['traps'], allowedUnits:KL, defaultUnit:'kg', unilateralDefault:true },

  // ---- arms ----
  { name:'Z bar barbell curl', muscles:['biceps','forearms'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true, aliases:['z curl babel curls'] },
  { name:'Z bar preacher curl', muscles:['biceps'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true },
  { name:'Hammer curl', muscles:['biceps','forearms'], allowedUnits:KL, defaultUnit:'lb', unilateralDefault:true },
  { name:'Dumbbell concentration curl', muscles:['biceps'], allowedUnits:KL, defaultUnit:'lb', unilateralDefault:true, aliases:['db concentration curls'] },
  { name:'Dumbbell wrist curl', muscles:['forearms'], allowedUnits:KL, defaultUnit:'kg', unilateralDefault:true, aliases:['forearms db wrist curls'] },

  // ---- legs ----
  { name:'Smith machine squat', muscles:['quads','glutes','hamstrings'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true },
  { name:'Leg press', muscles:['quads','glutes'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true },
  { name:'Leg curl', muscles:['hamstrings'], allowedUnits:KL, defaultUnit:'lb' },
  { name:'Leg extension', muscles:['quads'], allowedUnits:KL, defaultUnit:'lb' },
  { name:'Smith machine calf raise', muscles:['calves'], allowedUnits:KL, defaultUnit:'kg', perSideDefault:true },
];
