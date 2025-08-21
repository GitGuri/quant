// src/components/profile/ProfileForm.tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label'; // Added Label import
import { Input } from '@/components/ui/input'; // Use ShadCN Input
import { Textarea } from '@/components/ui/textarea'; // Use ShadCN Textarea
import { // Use ShadCN Select
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../../AuthPage';

// --- Define API Base URL ---
// TODO: Update this to your deployed backend URL or use environment variables
const API_BASE_URL = 'https://quantnow.onrender.com';
// --- End Define API Base URL ---

export function ProfileForm() {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    address: '',
    city: '',
    province: '',
    postalCode: '', // camelCase for state
    country: '',
    bio: '',
    website: '',
    linkedin: '',
    timezone: '',
    language: '',
    currency: '',
    userId: '',
  });

  const [loading, setLoading] = useState(true);
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated || !token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // --- Use API_BASE_URL ---
        const res = await fetch(`${API_BASE_URL}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to load profile.');
        }
        const data = await res.json();
        // --- Correctly map snake_case from DB to camelCase in state ---
        const [firstName, ...lastNameParts] = (data.name || '').split(' '); // Handle potential null/empty name
        setFormData({
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          company: data.company || '',
          position: data.position || '',
          city: data.city || '',
          province: data.province || '',
          postalCode: data.postal_code || '', // Map snake_case
          country: data.country || '',
          bio: data.bio || '',
          website: data.website || '',
          linkedin: data.linkedin || '',
          timezone: data.timezone || '',
          language: data.language || '',
          currency: data.currency || '',
          userId: data.user_id || '',
        });
      } catch (err: any) {
        console.error('Could not fetch profile:', err);
        alert(`Could not fetch profile: ${err.message || 'Unknown error'}`); // Simple alert, consider using a toast notification
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [isAuthenticated, token]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!isAuthenticated || !token) {
      alert('You are not authenticated.');
      return;
    }
    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      // --- Prepare payload matching backend expectations ---
      const payload = {
        name: fullName,
        contact_person: fullName, // Ensure this field name matches the backend query
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        company: formData.company,
        position: formData.position,
        city: formData.city,
        province: formData.province,
        postal_code: formData.postalCode, // Map camelCase back to snake_case for backend
        country: formData.country,
        bio: formData.bio,
        website: formData.website,
        linkedin: formData.linkedin,
        timezone: formData.timezone,
        language: formData.language,
        currency: formData.currency,
        // user_id is usually not updated by the user, handled by backend auth
        // user_id: formData.userId,
      };

      // --- Update profile ---
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Profile update failed.');
      }
      // --- End Update profile ---

      // --- If password change is requested ---
      if (changePassword) {
        if (!newPassword || newPassword !== confirmPassword) {
          alert('Passwords do not match.');
          return;
        }
        if (newPassword.length < 6) {
          alert('Password must be at least 6 characters long.');
          return;
        }

        const passRes = await fetch(`${API_BASE_URL}/api/profile/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password: newPassword }),
        });

        if (!passRes.ok) {
          const errorData = await passRes.json();
          throw new Error(errorData.error || 'Password update failed.');
        }
      }
      // --- End If password change is requested ---

      alert('Profile saved successfully!');
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      alert(`Failed to save profile: ${err.message || 'Unknown error'}`);
    }
  };

  if (loading) return <Skeleton className='h-[400px] w-full max-w-4xl mx-auto' />; // Adjusted skeleton height

  return (
    <div className='max-w-4xl mx-auto space-y-6'>
      {/* Personal Information Card */}
      <Card>
        <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center space-x-4'>
            <Avatar className='h-20 w-20'>
              <AvatarImage src='/placeholder.svg?height=80&width=80' alt="Profile" /> {/* Added alt and query params */}
              <AvatarFallback>{(formData.firstName?.charAt(0) || '?')}{(formData.lastName?.charAt(0) || '?')}</AvatarFallback>
            </Avatar>
            <Button variant='outline' size='sm' disabled>
              <Camera className='h-4 w-4 mr-2' /> Change Photo
            </Button>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Added Labels for better accessibility and structure */}
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" placeholder='First Name' value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" placeholder='Last Name' value={formData.lastName} onChange={e => handleChange('lastName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder='Email' value={formData.email} onChange={e => handleChange('email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" placeholder='Phone' value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" placeholder='Bio' value={formData.bio} onChange={e => handleChange('bio', e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Company Information Card */}
      <Card>
        <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
        <CardContent className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" placeholder='Company' value={formData.company} onChange={e => handleChange('company', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position">Position</Label>
            <Input id="position" placeholder='Position' value={formData.position} onChange={e => handleChange('position', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" type="url" placeholder='https://example.com' value={formData.website} onChange={e => handleChange('website', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn</Label>
            <Input id="linkedin" type="url" placeholder='https://linkedin.com/in/username' value={formData.linkedin} onChange={e => handleChange('linkedin', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Address Information Card */}
      <Card>
        <CardHeader><CardTitle>Address Information</CardTitle></CardHeader>
        <CardContent className='space-y-4'>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder='Street Address' value={formData.address} onChange={e => handleChange('address', e.target.value)} />
          </div>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" placeholder='City' value={formData.city} onChange={e => handleChange('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <Input id="province" placeholder='Province' value={formData.province} onChange={e => handleChange('province', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input id="postalCode" placeholder='Postal Code' value={formData.postalCode} onChange={e => handleChange('postalCode', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country-select">Country</Label>
            <Select value={formData.country} onValueChange={value => handleChange('country', value)}>
              <SelectTrigger id="country-select">
                <SelectValue placeholder='Country' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='South Africa'>South Africa</SelectItem>
                <SelectItem value='Zimbabwe'>Zimbabwe</SelectItem>
                {/* Add more countries as needed */}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

     

      {/* Change Password Section */}
      <Card>
        <CardContent className='pt-6'>
        <div className='space-y-4'>
          <div className="flex items-center space-x-2">
            <input
              id="changePasswordCheckbox"
              type='checkbox'
              checked={changePassword}
              onChange={e => setChangePassword(e.target.checked)}
            />
            <Label htmlFor="changePasswordCheckbox">Change Password</Label>
          </div>
          {changePassword && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-2'>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                 id="newPassword"
                  type='password'
                  placeholder='New Password'
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                 id="confirmPassword"
                  type='password'
                  placeholder='Confirm Password'
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className='flex justify-end'>
        <Button onClick={handleSave} disabled={!isAuthenticated}>
          <Save className='h-4 w-4 mr-2' /> Save Profile
        </Button>
      </div>
    </div>
  );
}