import {propertyLogo} from '../../services/platformAdmin';
import {propertyInitials} from '../../services/propertyBranding';
export default function PropertyLogo({property,className=''}){
 return property?.logo_path?<img src={propertyLogo(property.logo_path)} alt={(property.name||'Property')+' logo'} className={className+' object-contain'}/>:<span role="img" aria-label={(property?.name||'Property')+' initials'} className={className+' inline-flex items-center justify-center bg-blue-50 text-blue-700 font-semibold'}>{propertyInitials(property?.name)}</span>;
}
