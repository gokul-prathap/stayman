import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStaff } from '../../../components/auth/StaffGate';
import { loadPropertyData } from '../../../services/stayman';
export function usePropertyData() {
  const { property } = useStaff();
  const client = useQueryClient();
  const key = ['stayman', property.id];
  const query = useQuery({ queryKey: key, queryFn: () => loadPropertyData(property.id) });
  return { ...query, refresh: () => client.invalidateQueries({ queryKey: key }) };
}
