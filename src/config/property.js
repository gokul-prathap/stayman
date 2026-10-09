import hostaricaLogo from '../assets/images/hostarica.png';

export const property = {
  appName: 'Stayman',
  name: import.meta.env.VITE_PROPERTY_NAME || 'Hostarica',
  description: import.meta.env.VITE_PROPERTY_DESCRIPTION || 'Backpackers Hostel',
  logo: hostaricaLogo,
};
