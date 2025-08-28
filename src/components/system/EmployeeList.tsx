// src/components/staff/EmployeeList.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Search, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type Employee } from '../payroll/PayrollDashboard'; // Assuming this path is correct

interface EmployeeListProps {
  employees: Employee[]; // Add employees prop to receive data from parent
  onEditEmployee: (employee: Employee) => void;
  onSelectEmployee: (employee: Employee | null) => void; // To select employee for viewing details (e.g., in PayslipGenerator)
  selectedEmployee: Employee | null; // To highlight selected employee
  onEmployeeActionSuccess: () => Promise<void>; // To refresh list after add/edit/delete
}

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com'; // Define your API base URL

export const EmployeeList: React.FC<EmployeeListProps> = ({
  employees, // Receive employees from props
  onEditEmployee,
  onSelectEmployee, // Use this for viewing/selecting
  selectedEmployee,
  onEmployeeActionSuccess // Use this to trigger parent refresh
}) => {
  const [loading, setLoading] = useState(false); // Loading state for delete operation
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  // No need for internal fetchEmployees here, as data is passed via props
  // The parent (PayrollDashboard) handles fetching and passing the data.

  const handleDeleteEmployee = async (id: string) => {
    setLoading(true); // Set loading for the delete operation
    try {
      const response = await fetch(`${API_BASE_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to delete employee.');
      }

      toast({
        title: 'Success',
        description: 'Employee deleted successfully.',
      });
      await onEmployeeActionSuccess(); // Trigger refresh in parent component
      onSelectEmployee(null); // Deselect employee after deletion
    } catch (err) {
      console.error('Error deleting employee:', err);
      toast({
        title: 'Error',
        description: `Failed to delete employee: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false); // Reset loading after delete operation
    }
  };

  const filteredEmployees = employees.filter(
    employee =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.position?.toLowerCase().includes(searchTerm.toLowerCase()) || // Added optional chaining
      employee.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-xl font-medium'>Employee List</CardTitle>
        <div className='flex items-center space-x-2'>
          <Input
            placeholder='Search employees...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='max-w-sm'
            // icon={<Search className='h-4 w-4 text-muted-foreground' />} // Removed Ant Design specific icon prop
            prefix={<Search className='h-4 w-4 text-muted-foreground mr-2' />} // Using prefix for Lucide icon
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? ( // This loading state is for the delete operation
          <div className='flex justify-center items-center h-40'>
            <Loader2 className='h-8 w-8 animate-spin' />
          </div>
        ) : error ? (
          <div className='text-red-500 text-center py-4'>{error}</div>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Payment Type</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className='text-center'>
                      No employees found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map(employee => (
                    <TableRow
                      key={employee.id}
                      onClick={() => onSelectEmployee(employee)} // Select employee on row click
                      className={selectedEmployee?.id === employee.id ? 'bg-blue-50 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'} // Highlight selected row
                    >
                      <TableCell className='font-medium'>{employee.name}</TableCell>
                      <TableCell>{employee.position}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.start_date}</TableCell> {/* Use start_date from backend */}
                      <TableCell>
                        <Badge variant={employee.payment_type === 'salary' ? 'default' : 'secondary'}>
                          {employee.payment_type === 'salary' ? 'Salary' : 'Hourly'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end space-x-2'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click from firing
                              onEditEmployee(employee);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click from firing
                              onSelectEmployee(employee); // Explicitly select for view/payslip
                            }}
                          >
                            View
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={(e) => e.stopPropagation()} // Prevent row click from firing
                              >
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Employee</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {employee.name}?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteEmployee(employee.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
