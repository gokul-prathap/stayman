export function refreshPropertyQueries(client,propertyId){
 return Promise.all(['stayman','guest-directory','global-search','guest-profile'].map(name=>client.invalidateQueries({queryKey:[name,propertyId]})));
}
