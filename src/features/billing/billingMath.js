export const chargeTypes=[['EARLY_CHECKIN','Early check-in'],['TOWEL','Towel'],['SOAP','Soap'],['TOOTHBRUSH','Toothbrush'],['LOCKER','Locker'],['LOCK_PENALTY','Lost / damaged lock'],['DAMAGE_PENALTY','Damage penalty'],['OTHER','Other charge']];
export const emptyTax=()=>({cgst_bps:0,sgst_bps:0,igst_bps:0,sac:''});
export function calculateLine(amount,rate={},mode='INCLUSIVE'){
 if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Invalid charge amount.');
 if(!['INCLUSIVE','EXCLUSIVE'].includes(mode))throw new Error('Invalid price mode.');
 const rates=['cgst_bps','sgst_bps','igst_bps'].map(key=>rate[key]??0);
 if(rates.some(value=>!Number.isInteger(value)||value<0||value>10000)||rates[2]&&(rates[0]||rates[1]))throw new Error('Invalid tax configuration.');
 const round=(numerator,denominator)=>Number((numerator+denominator/2n)/denominator);
 const totalRate=rates.reduce((a,b)=>a+b,0),base=mode==='INCLUSIVE'?round(BigInt(amount)*10000n,BigInt(10000+totalRate)):amount;
 const taxes=rates.map(rate=>round(BigInt(base)*BigInt(rate),10000n));
 const sum=base+taxes.reduce((a,b)=>a+b,0),adjustment=mode==='INCLUSIVE'?amount-sum:0;
 if(!Number.isSafeInteger(sum+adjustment))throw new Error('Charge exceeds the supported money range.');
 return {taxable:base,cgst:taxes[0],sgst:taxes[1],igst:taxes[2],adjustment,total:sum+adjustment};
}
