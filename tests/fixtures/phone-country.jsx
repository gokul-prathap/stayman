import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {getCountryCallingCode} from 'libphonenumber-js/max';
import PhoneInput from '../../src/features/rooms/components/PhoneInput';
function Fixture(){
 const [country,setCountry]=useState('IN'),[phone,setPhone]=useState('+919876543210');
 return <main className="management" style={{maxWidth:450,padding:30,margin:'30px auto'}}><h1>Phone country picker</h1><PhoneInput country={country} value={phone} onChange={setPhone} onCountryChange={(next,national)=>{setCountry(next);setPhone('+'+getCountryCallingCode(next)+national);}}/><p data-country={country}>Selected: {country}</p></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
