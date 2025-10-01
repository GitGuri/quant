import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../AuthPage'; // Import useAuth

const API_BASE_URL = 'http://localhost:3000'; // Changed to localhost:3000 based on previous context

interface Client {
  id: string;
  name: string;
  contacts: string; // Assuming this is a string with '\n' for multiple contacts
  quotes: number;
  invoices: number;
  lifetimeValue: string; // Assuming this comes as a formatted string like 'R698,00'
  cluster: number;
  riskLevel: 'Low' | 'Medium' | 'High'; // Assuming these are the possible values
}

export function ClientsTable() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated } = useAuth(); // Get authentication status
  // FIX: Change 'token' to 'access_token' to match the key used in AuthPage.tsx
  const token = localStorage.getItem('token'); // Retrieve the token

  const fetchClients = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated for clients table.');
      setClients([]);
      setIsLoading(false);
      setError('Please log in to view client data.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: Client[] = await response.json();
      setClients(data);
    } catch (err: any) {
      console.error('Error fetching clients:', err);
      setError(err.message || 'Failed to load client data.');
      setClients([]); // Clear clients on error
    } finally {
      setIsLoading(false);
    }
  }, [token]); // Add token to dependencies

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchClients();
    } else {
      setClients([]);
      setIsLoading(false);
      setError('Please log in to view client data.');
    }
  }, [fetchClients, isAuthenticated, token]); // Add isAuthenticated and token to dependencies

  if (isLoading) {
    return (
      <div className='flex justify-center items-center h-40'>
        <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
        <span className='ml-2 text-gray-600'>Loading clients...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className='text-center text-red-500 p-4 border border-red-300 rounded-md'>
        <p>Error: {error}</p>
        <Button onClick={fetchClients} className='mt-2'>Retry</Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Client Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead>
                <tr className='border-b'>
                  <th className='text-left p-2'>Client#</th>
                  <th className='text-left p-2'>Client Name</th>
                  <th className='text-left p-2'>Contacts</th>
                  <th className='text-left p-2'># Quotes</th>
                  <th className='text-left p-2'># Invoices</th>
                  <th className='text-left p-2'>Lifetime Value</th>
                  <th className='text-left p-2'>Cluster</th>
                  <th className='text-left p-2'>Risk Level</th>
                  <th className='text-left p-2'>Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr className='border-b'>
                    <td colSpan={9} className='text-center py-4 text-muted-foreground'>
                      No clients found.
                    </td>
                  </tr>
                ) : (
                  clients.map(client => (
                    <tr key={client.id} className='border-b'>
                      <td className='p-2'>{client.id}</td>
                      <td className='p-2 font-medium'>{client.name}</td>
                      <td className='p-2 text-sm text-muted-foreground'>
                        {client.contacts.split('\n').map((contact, i) => (
                          <div key={i}>{contact}</div>
                        ))}
                      </td>
                      <td className='p-2'>{client.quotes}</td>
                      <td className='p-2 text-orange-600 font-medium'>
                        {client.invoices}
                      </td>
                      <td className='p-2'>{client.lifetimeValue}</td>
                      <td className='p-2'>{client.cluster}</td>
                      <td className='p-2'>
                        <Badge
                          variant='secondary'
                          className='bg-green-100 text-green-800'
                        >
                          {client.riskLevel}
                        </Badge>
                      </td>
                      <td className='p-2'>
                        <Button variant='ghost' size='sm'>
                          <MoreHorizontal className='h-4 w-4' />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
