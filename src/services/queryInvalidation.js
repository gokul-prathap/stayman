export function refreshPropertyQueries(client,propertyId){
 return Promise.all(['stayman','guest-directory','global-search','guest-profile','aiosell-settings','aiosell-pricing','finance'].map(name=>client.invalidateQueries({queryKey:[name,propertyId]})));
}
