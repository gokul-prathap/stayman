import {useState} from 'react';
import {useExpenseRefresh} from '../hooks/useExpenseData';
import ExpenseForm,{ExpenseDialog} from './ExpenseForm';
import '../management.css';
import './expense-reports.css';
export default function QuickExpenseModal({onClose,onSaved}){
 const refresh=useExpenseRefresh(),[busy,setBusy]=useState(false);
 const close=()=>{if(!busy)onClose();};
 return <ExpenseDialog title="Quick expense" onClose={close}><ExpenseForm onBusyChange={setBusy} onClose={close} onSaved={async()=>{await refresh();onSaved?.();onClose();}}/></ExpenseDialog>;
}
