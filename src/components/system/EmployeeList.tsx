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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Loader2, Trash2, Edit, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type Employee } from '../payroll/PayrollDashboard';

interface EmployeeListProps {
  employees: Employee[];
  onEditEmployee: (employee: Employee) => void;
  onSelectEmployee: (employee: Employee | null) => void;
  selectedEmployee: Employee | null;
  onEmployeeActionSuccess: () => Promise<void>;
}

const API_BASE_URL = 'https://quantnow.onrender.com';

export const EmployeeList: React.FC<EmployeeListProps> = ({
  employees,
  onEditEmployee,
  onSelectEmployee,
  selectedEmployee,
  onEmployeeActionSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    } : {};
  }, []);

  const handleDeleteEmployee = async (id: string) => {
    setLoading(true);
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
      await onEmployeeActionSuccess();
      onSelectEmployee(null);
    } catch (err) {
      console.error('Error deleting employee:', err);
      toast({
        title: 'Error',
        description: `Failed to delete employee: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewEmployee = (employee: Employee) => {
    setViewEmployee(employee);
    setIsViewModalOpen(true);
  };

  const filteredEmployees = employees.filter(
    employee =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Employee View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Employee Details</DialogTitle>
          </DialogHeader>
          {viewEmployee && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">Personal Information</h3>
                <p><span className="font-medium">Name:</span> {viewEmployee.name}</p>
                <p><span className="font-medium">Position:</span> {viewEmployee.position}</p>
                <p><span className="font-medium">Email:</span> {viewEmployee.email}</p>
                <p><span className="font-medium">ID Number:</span> {viewEmployee.id_number}</p>
                <p><span className="font-medium">Phone:</span> {viewEmployee.phone}</p>
                <p><span className="font-medium">Start Date:</span> {viewEmployee.start_date}</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">Payment Information</h3>
                <p>
                  <span className="font-medium">Payment Type:</span>
                  <Badge className="ml-2" variant={viewEmployee.payment_type === 'salary' ? 'default' : 'secondary'}>
                    {viewEmployee.payment_type === 'salary' ? 'Salary' : 'Hourly'}
                  </Badge>
                </p>
                {viewEmployee.payment_type === 'salary' ? (
                  <p><span className="font-medium">Base Salary:</span> R{viewEmployee.base_salary}</p>
                ) : (
                  <p><span className="font-medium">Hourly Rate:</span> R{viewEmployee.hourly_rate}</p>
                )}
                <p><span className="font-medium">Hours Worked:</span> {viewEmployee.hours_worked_total || 0}</p>
                
                <h3 className="font-semibold text-lg mt-4 mb-2">Bank Details</h3>
                <p><span className="font-medium">Account Holder:</span> {viewEmployee.account_holder}</p>
                <p><span className="font-medium">Bank Name:</span> {viewEmployee.bank_name}</p>
                <p><span className="font-medium">Account Number:</span> {viewEmployee.account_number}</p>
                <p><span className="font-medium">Branch Code:</span> {viewEmployee.branch_code}</p>
              </div>
            </div>
          )}
          <div className="flex justify-end mt-4">
            <Button onClick={() => setIsViewModalOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Card className='w-full'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-xl font-medium'>Employee List</CardTitle>
          <div className='flex items-center space-x-2'>
            <Input
              placeholder='Search employees...'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className='max-w-sm'
              prefix={<Search className='h-4 w-4 text-muted-foreground mr-2' />}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
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
                        onClick={() => onSelectEmployee(employee)}
                        className={selectedEmployee?.id === employee.id ? 'bg-blue-50 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'}
                      >
                        <TableCell className='font-medium'>{employee.name}</TableCell>
                        <TableCell>{employee.position}</TableCell>
                        <TableCell>{employee.email}</TableCell>
                        <TableCell>{employee.start_date}</TableCell>
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
                                e.stopPropagation();
                                onEditEmployee(employee);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewEmployee(employee);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={(e) => e.stopPropagation()}
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
    </>
  );
};