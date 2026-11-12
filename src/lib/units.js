// Data is always stored in kg and cm. These helpers convert for display and input.

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export const isImperial = (sys) => sys === 'imperial';
export const wUnit = (sys) => (isImperial(sys) ? 'lb' : 'kg');
export const lUnit = (sys) => (isImperial(sys) ? 'in' : 'cm');

export const toW = (kg, sys) => (isImperial(sys) ? kg / KG_PER_LB : kg);
export const fromW = (v, sys) => (isImperial(sys) ? v * KG_PER_LB : v);
export const toL = (cm, sys) => (isImperial(sys) ? cm / CM_PER_IN : cm);
export const fromL = (v, sys) => (isImperial(sys) ? v * CM_PER_IN : v);
