export const genderOptions=[['MALE','Male'],['FEMALE','Female'],['NON_BINARY','Non-binary / another gender'],['PREFER_NOT_TO_SAY','Prefer not to say']];
export function genderLabel(value){return genderOptions.find(([key])=>key===value)?.[1]||(value==='OTHER'?'Other / unspecified':'Not provided');}
export function isGuestGender(value){return genderOptions.some(([key])=>key===value);}
