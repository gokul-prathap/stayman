import React from 'react';
import './services/navigationGuard';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './app/routes';
import './index.css';
import './theme/palette.css';
import './theme/theme.css';
import {ThemeProvider} from './theme/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: 120000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><BrowserRouter>
        <AppRoutes />
      </BrowserRouter></ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
