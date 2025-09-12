// src/components/profile/ProfileForm.tsx
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Save, Upload, Trash2, Loader2, Image as ImageIcon, Shield } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../../AuthPage';

// --- Define API Base URL ---
const API_BASE_URL = 'https://quantnow.onrender.com';
// --- End Define API Base URL ---

export function ProfileForm() {
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

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
    postalCode: '',
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

  // Self-downgrade busy flag
  const [roleBusy, setRoleBusy] = useState(false);

  // ===== Logo state =====
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- helpers ----
  const alertErr = (msg: string) =>
    alert(msg || 'Something went wrong. Please try again.');

  // Fetch profile + current logo URL
  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated || !token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Profile
        const res = await fetch(`${API_BASE_URL}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to load profile.');
        }
        const data = await res.json();
        const [firstName, ...lastNameParts] = (data.name || '').split(' ');
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
          postalCode: data.postal_code || '',
          country: data.country || '',
          bio: data.bio || '',
          website: data.website || '',
          linkedin: data.linkedin || '',
          timezone: data.timezone || '',
          language: data.language || '',
          currency: data.currency || '',
          userId: data.user_id || '',
        });

        // Logo URL
        const lres = await fetch(`${API_BASE_URL}/logo`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (lres.ok) {
          const ldata = await lres.json().catch(() => ({}));
          setLogoUrl(ldata?.url || null);
        } else {
          setLogoUrl(null);
        }
      } catch (err: any) {
        console.error('Could not fetch profile:', err);
        alertErr(`Could not fetch profile: ${err?.message || 'Unknown error'}`);
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
      const payload = {
        name: fullName,
        contact_person: fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        company: formData.company,
        position: formData.position,
        city: formData.city,
        province: formData.province,
        postal_code: formData.postalCode,
        country: formData.country,
        bio: formData.bio,
        website: formData.website,
        linkedin: formData.linkedin,
        timezone: formData.timezone,
        language: formData.language,
        currency: formData.currency,
      };

      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Profile update failed.');
      }

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
          const errorData = await passRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Password update failed.');
        }
      }

      alert('Profile saved successfully!');
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      alertErr(`Failed to save profile: ${err?.message || 'Unknown error'}`);
    }
  };

  // ===== Self-downgrade handler =====
  const handleSelfDowngrade = async () => {
    if (!isAuthenticated || !token) {
      alert('You are not authenticated.');
      return;
    }
    const password = window.prompt('Enter the Qx password to upgrade your role to User:');
    if (password == null) return; // user cancelled
    if (!password.trim()) {
      alert('Password is required.');
      return;
    }

    setRoleBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/self-role-downgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Failed to downgrade role.');
        return;
      }

      alert('Role changed to user. For safety, please log in again.');
      // Optional: force re-login so permissions refresh immediately.
      localStorage.removeItem('token');
      window.location.href = '/login';
    } catch (e: any) {
      console.error('[self-role-downgrade] error:', e);
      alertErr(e?.message || 'Failed to downgrade role.');
    } finally {
      setRoleBusy(false);
    }
  };

  // ===== Logo handlers (mirror documents flow) =====
  const uploadLogo = async (file: File) => {
    if (!isAuthenticated || !token) {
      alert('You are not authenticated.');
      return;
    }
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append('logo', file); // field name expected by /upload-logo
      const res = await fetch(`${API_BASE_URL}/upload-logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to upload logo');
      }
      // refresh logo url
      const lres = await fetch(`${API_BASE_URL}/logo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ldata = await lres.json().catch(() => ({}));
      setLogoUrl(ldata?.url || null);
    } catch (e: any) {
      alertErr(e?.message || 'Logo upload failed');
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteLogo = async () => {
    if (!isAuthenticated || !token) return;
    setLogoBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to delete logo');
      }
      setLogoUrl(null);
    } catch (e: any) {
      alertErr(e?.message || 'Logo delete failed');
    } finally {
      setLogoBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-[400px] w-full max-w-4xl mx-auto" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Personal Information Card */}
      <Card>
        <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src="/placeholder.svg?height=80&width=80" alt="Profile" />
              <AvatarFallback>
                {(formData.firstName?.charAt(0) || '?')}
                {(formData.lastName?.charAt(0) || '?')}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" disabled>
              <Camera className="h-4 w-4 mr-2" /> Change Photo
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" placeholder="First Name" value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" placeholder="Last Name" value={formData.lastName} onChange={e => handleChange('lastName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Email" value={formData.email} onChange={e => handleChange('email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" placeholder="Phone" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" placeholder="Bio" value={formData.bio} onChange={e => handleChange('bio', e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Company Information Card */}
      <Card>
        <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" placeholder="Company" value={formData.company} onChange={e => handleChange('company', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position">Position</Label>
            <Input id="position" placeholder="Position" value={formData.position} onChange={e => handleChange('position', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" type="url" placeholder="https://example.com" value={formData.website} onChange={e => handleChange('website', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn</Label>
            <Input id="linkedin" type="url" placeholder="https://linkedin.com/in/username" value={formData.linkedin} onChange={e => handleChange('linkedin', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Company Logo (simple, like documents) */}
      <Card>
        <CardHeader><CardTitle>Company Logo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 flex items-center justify-center bg-muted/30 min-h-40">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company Logo" className="max-h-28 object-contain" />
            ) : (
              <div className="text-muted-foreground flex items-center gap-2">
                <ImageIcon className="h-5 w-5" /> No logo uploaded
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f);
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={logoBusy}>
              {logoBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {logoUrl ? 'Replace Logo' : 'Upload Logo'}
            </Button>
            {logoUrl && (
              <Button variant="destructive" onClick={deleteLogo} disabled={logoBusy}>
                <Trash2 className="h-4 w-4 mr-2" /> Remove
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Supported: PNG, JPG, WEBP, SVG. Max 5 MB.
          </p>
        </CardContent>
      </Card>

      {/* Address Information Card */}
      <Card>
        <CardHeader><CardTitle>Address Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="Street Address" value={formData.address} onChange={e => handleChange('address', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" placeholder="City" value={formData.city} onChange={e => handleChange('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <Input id="province" placeholder="Province" value={formData.province} onChange={e => handleChange('province', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input id="postalCode" placeholder="Postal Code" value={formData.postalCode} onChange={e => handleChange('postalCode', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country-select">Country</Label>
            <Select value={formData.country} onValueChange={value => handleChange('country', value)}>
              <SelectTrigger id="country-select">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="South Africa">South Africa</SelectItem>
                <SelectItem value="Zimbabwe">Zimbabwe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Role & Access Section */}
      <Card>
        <CardHeader><CardTitle>Role & Access</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If you currently have <strong>admin</strong> access and want to switch to  <strong>user</strong> for this company,
            you can upgrade yourself below. You’ll be asked for the QxAnalytix password.To get this password you need to contact the QxAnalytix team.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={handleSelfDowngrade}
              disabled={!isAuthenticated || roleBusy}
              title="Upgrade your role from admin to user"
            >
              {roleBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              Upgrade my role to User
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You will be logged out after the change so your permissions refresh.
          </p>
        </CardContent>
      </Card>

      {/* Change Password Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                id="changePasswordCheckbox"
                type="checkbox"
                checked={changePassword}
                onChange={e => setChangePassword(e.target.checked)}
              />
              <Label htmlFor="changePasswordCheckbox">Change Password</Label>
            </div>
            {changePassword && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm Password"
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
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!isAuthenticated}>
          <Save className="h-4 w-4 mr-2" /> Save Profile
        </Button>
      </div>
    </div>
  );
}
