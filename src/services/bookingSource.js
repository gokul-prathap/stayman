const sites={
 booking:{label:'Booking.com',icon:'booking.png',initials:'B.'},
 agoda:{label:'Agoda',icon:'agoda.png',initials:'a'},
 airbnb:{label:'Airbnb',icon:'airbnb.ico',initials:'A'},
 expedia:{label:'Expedia',icon:'expedia.ico',initials:'E'},
 makemytrip:{label:'MakeMyTrip',icon:'makemytrip.ico',initials:'MMT'},
 goibibo:{label:'Goibibo',icon:'goibibo.ico',initials:'go'},
 hostelworld:{label:'Hostelworld',icon:'hostelworld.ico',initials:'H'}
};
const aliases={booking:'booking',bookingcom:'booking',bookingdotcom:'booking',agoda:'agoda',agodacom:'agoda',airbnb:'airbnb',airbnbcom:'airbnb',expedia:'expedia',expediacom:'expedia',mmt:'makemytrip',makemytrip:'makemytrip',makemytripcom:'makemytrip',goibibo:'goibibo',goibibocom:'goibibo',hostelworld:'hostelworld',hostelworldcom:'hostelworld'};
export function bookingSource(source){
 const label=typeof source==='string'?source.trim():'';
 if(!label)return {kind:'unknown',label:'Source not recorded',initials:'?'};
 const normalized=label.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(['direct','directbooking','walkin','walkinbooking'].includes(normalized))return {kind:'direct',label:normalized.startsWith('walkin')?'Walk-in':'Direct booking',initials:'D'};
 if(normalized==='gommt')return {kind:'other',label:'GoMMT',initials:'GM'}; // Joint source: do not guess which brand supplied it.
 const key=aliases[normalized];
 return key?{kind:'site',...sites[key],icon:'/images/booking-sites/'+sites[key].icon}:{kind:'other',label,initials:label.slice(0,2).toUpperCase()};
}
