import AppLoader from '../../../components/ui/AppLoader';
import { databaseError } from '../../../services/stayman';
export default function PageState({ pending, error, retry }) {
  if (pending) return <AppLoader label="Loading property records..."/>;
  if (!error) return null;
  return <div role="alert" className="error">{databaseError(error)}{retry && <button onClick={retry} className="secondary ml-3">Retry</button>}</div>;
}
