export function greetingPeriod(date,timeZone){
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(date));
 return hour>=19||hour<6?'night':hour>=17?'sunset':'day';
}
