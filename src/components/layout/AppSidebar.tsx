import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  Home,
  CheckSquare,
  CreditCard,
  BarChart3,
  Upload,
  TrendingUp,
  FileText,
  MessageSquare,
  FolderOpen,
  Calculator,
  Users,
  Settings,
  User,
  LogOut,
  Package,
  DollarSign,
  Wallet,
  ChevronUp,
  ChevronDown,
  ListStartIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import { MoneyCollectFilled } from '@ant-design/icons';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/AuthPage';
import { List } from 'antd';

// Define an interface for your navigation item data, including optional children for sub-menus
interface NavigationItem {
  title: string;
  url: string;
  icon: React.ElementType | any;
  children?: NavigationItem[];
  allowedRoles?: string[];
}


// Hard-coded list of main navigation items with specific role access
const navigationItems: NavigationItem[] = [
  // User and ceo roles now have access to all tabs by default
  { title: 'Dashboard', url: '/', icon: Home, allowedRoles: ['admin', 'ceo', 'manager', 'cashier', 'user'] },
  {
    title: 'POS Transact',
    url: '/pos',
    icon: CreditCard,
    // Added 'ceo' and 'user' roles to this item and its children
    allowedRoles: ['cashier', 'user', 'pos-transact', 'admin'],

  },
  { title: 'Tasks', url: '/tasks', icon: ListStartIcon, allowedRoles: ['manager', 'user', 'tasks', 'admin'] },
  // Added 'ceo' role
  { title: 'Transactions', url: '/transactions', icon: CreditCard, allowedRoles: ['manager', 'user', 'transactions', 'admin'] },
  // Added 'user' role
 
  { title: 'Financials', url: '/financials', icon: BarChart3, allowedRoles: ['admin', 'manager', 'financials', 'user'] },
  // Added 'ceo' and 'user' roles
  { title: 'Import', url: '/import', icon: Upload, allowedRoles: ['manager', 'import', 'user', 'admin'] },
  // Added 'user' role
  { title: 'Data Analytics', url: '/analytics', icon: TrendingUp, allowedRoles: ['admin', 'manager', 'data-analytics', 'user'] },
];

// Hard-coded list of business tools navigation items with specific role access
const businessItems: NavigationItem[] = [
  // Added 'ceo' role
  { title: 'Invoice/Quote', url: '/invoice-quote', icon: FileText, allowedRoles: ['manager', 'user', 'invoice', 'admin'] },
  // Added 'ceo' and 'user' roles
  { title: 'Payroll', url: '/payroll', icon: Calculator, allowedRoles: ['manager', 'payroll', 'user', 'admin'] },
  {
    title: 'POS Admin',
    url: '/pos/products',
    icon: CreditCard,
    // Added 'ceo' and 'user' roles to this item and its children
    allowedRoles: ['manager', 'pos-admin', 'user', 'ceo'],
    children: [
      { title: 'Products', url: '/pos/products', icon: Package, allowedRoles: ['manager', 'pos-admin', 'user', 'admin'] },
      { title: 'Credits', url: '/pos/credits', icon: DollarSign, allowedRoles: ['manager', 'pos-admin', 'user', 'admin'] },
      { title: 'Cash', url: '/pos/cash', icon: Wallet, allowedRoles: ['manager', 'pos-admin', 'user', 'admin'] },
    ],
  },
  // Added 'user' role
  { title: 'Projections', url: '/projections', icon: TrendingUp, allowedRoles: ['admin', 'manager', 'projections', 'user'] },
  // Added 'ceo' and 'user' roles
  { title: 'Accounting Setup', url: '/accounting', icon: Calculator, allowedRoles: ['admin', 'accountant', 'accounting', 'user', 'ceo'] },
  // These already had both roles, so no changes were needed
  { title: 'Document Management', url: '/documents', icon: FolderOpen, allowedRoles: ['admin', 'manager', 'user', 'cashier', 'accountant', 'ceo', 'documents'] },
  { title: 'Qx Chat', url: '/quant-chat', icon: MessageSquare, allowedRoles: ['admin', 'manager', 'user', 'cashier', 'accountant', 'ceo', 'chat'] },
];

// Hard-coded list of setup navigation items with specific role access
const setupItems: NavigationItem[] = [
  // Added 'user' role
  { title: 'User Management', url: '/user-management', icon: Users, allowedRoles: ['admin', 'ceo', 'user-management', 'user'] },
  // Added 'ceo' and 'user' roles
  { title: 'Personel Setup', url: '/personel-setup', icon: Users, allowedRoles: ['admin', 'manager', 'personel-setup', 'user', 'ceo'] },
  // Added 'ceo' role
  { title: 'Profile Setup', url: '/profile-setup', icon: Settings, allowedRoles: ['admin', 'user', 'profile-setup', 'ceo'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Get the user name and role from the authentication context
  const { logout, userName, userRoles } = useAuth();

  const currentPath = location.pathname;

  const [isPosSubMenuOpen, setIsPosSubMenuOpen] = useState(false);
  const [isPosAdminSubMenuOpen, setIsPosAdminSubMenuOpen] = useState(false);

  useEffect(() => {
    // Open sub-menu if any route within it is active
    setIsPosSubMenuOpen(currentPath.startsWith('/pos/'));
    setIsPosAdminSubMenuOpen(currentPath.startsWith('/pos-admin/'));
  }, [currentPath]);

  // Utility function to determine active navigation link class
  const getNavCls = (active: boolean) =>
    `flex items-center w-full px-3 py-2 rounded-md transition-colors duration-200
      ${active
        ? 'bg-blue-600 text-white font-bold shadow-sm'
        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-50'
      }`;

  // Handler for the logout button
  const handleLogout = () => {
    logout();
    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out.',
      variant: 'default',
    });
    navigate('/login');
  };

  /**
   * Determines if the current user has access to a navigation item based on their roles.
   * @param allowedRoles The list of roles that are allowed to access the item.
   * @returns true if the user has access, false otherwise.
   */
const hasAccess = (allowedRoles: string[] = []) => {
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.some(role => allowedRoles.includes(role));
};
  

  const renderSubMenu = (item: NavigationItem, isOpen: boolean, setIsOpen: (val: boolean) => void) => (
    <motion.div
      key={item.title}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            onClick={() => setIsOpen(!isOpen)}
            className={({ isActive }) => getNavCls(isActive || currentPath.startsWith(item.url))}
          >
            <item.icon className='h-5 w-5' />
            {state === 'expanded' && (
              <span className="flex-1">{item.title}</span>
            )}
            {state === 'expanded' && (
              isOpen ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {isOpen && state === 'expanded' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="pl-6 py-1">
            {item.children?.filter((child) => hasAccess(child.allowedRoles)).map((child, childIndex) => (
              <motion.div
                key={child.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: childIndex * 0.05 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={child.url}
                      className={({ isActive }) => getNavCls(isActive)}
                    >
                      <child.icon className='h-5 w-5' />
                      {state === 'expanded' && <span>{child.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );

  const renderMenuItem = (item: NavigationItem, index: number, totalItems: number, groupStartDelay: number) => (
    <motion.div
      key={item.title}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: (index + groupStartDelay) * 0.05 }}
    >
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            className={({ isActive }) => getNavCls(isActive)}
          >
            {item.icon === MoneyCollectFilled ? (
              <MoneyCollectFilled style={{ fontSize: '20px' }} />
            ) : (
              <item.icon className='h-5 w-5' />
            )}
            {state === 'expanded' && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </motion.div>
  );

  return (
    <Sidebar className='border-r bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50'>
      <SidebarHeader className='p-4 border-b border-gray-200 dark:border-gray-700'>
        <motion.div
          className='flex items-center space-x-2'
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className='w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center'>
            <span className='text-white font-bold text-sm'>Q</span>
          </div>
          {state === 'expanded' && (
            <div>
              <h1 className='font-bold text-lg'>QxAnalytix</h1>
              <p className='text-xs text-muted-foreground'>
                unlocking endless possibilities
              </p>
            </div>
          )}
        </motion.div>
      </SidebarHeader>

      <SidebarContent className='flex-1 overflow-y-auto'>
        {/* Main Navigation Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Main Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems
  .filter((item) => hasAccess(item.allowedRoles))
  .map((item, index) => {
    if (item.children) {
      return renderSubMenu(item, isPosSubMenuOpen, setIsPosSubMenuOpen);
    } else {
      return renderMenuItem(item, index, navigationItems.length, 0);
    }
  })}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Business Tools Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Business Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {businessItems
  .filter((item) => hasAccess(item.allowedRoles))
  .map((item, index) => {
    if (item.children) {
      return renderSubMenu(item, isPosAdminSubMenuOpen, setIsPosAdminSubMenuOpen);
    } else {
      return renderMenuItem(item, index, businessItems.length, navigationItems.length);
    }
  })}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Setup Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Setup</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {setupItems
  .filter((item) => hasAccess(item.allowedRoles))
  .map((item, index) =>
    renderMenuItem(item, index, setupItems.length, navigationItems.length + businessItems.length)
  )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className='p-4 border-t border-gray-200 dark:border-gray-700'>
{/* User Info */}
<div className='flex items-center space-x-2 text-sm text-muted-foreground mb-4'>
  <User className='h-5 w-5' />
  {state === 'expanded' && (
    <div className="flex flex-col">
      <span>{userName || 'Guest'}</span>
      <span className="text-xs text-muted-foreground">
        {userRoles && userRoles.length > 0 ? userRoles.join(', ') : 'No Role'}
      </span>
    </div>
  )}
</div>



        {/* Logout Button */}
        <SidebarMenuItem>
<SidebarMenuButton onClick={handleLogout} className='w-full justify-start text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'>
<LogOut className='h-5 w-5' />
            {state === 'expanded' && <span>Logout</span>}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarFooter>
    </Sidebar>
  );
}
