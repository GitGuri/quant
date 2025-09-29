// src/components/layout/AppSidebar.tsx
import React, { useState, useEffect, useRef } from 'react';
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
  UserPlus,
  UserCheck,
  Users2,
  Bot // Import an icon for the AI button
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
  { title: 'Dashboard', url: '/', icon: Home, allowedRoles: ['admin', 'ceo', 'manager', 'dashboard','cashier', 'user'] },
  {
    title: 'POS Transact',
    url: '/pos',
    icon: CreditCard,
    allowedRoles: ['cashier', 'user', 'pos-transact', 'admin'],
  },
  { title: 'Import', url: '/import', icon: Upload, allowedRoles: ['manager', 'import', 'user', 'admin'] },
  { title: 'Tasks', url: '/tasks', icon: ListStartIcon, allowedRoles: ['manager', 'user', 'tasks', 'admin'] },
  { title: 'Transactions', url: '/transactions', icon: CreditCard, allowedRoles: ['manager', 'user', 'transactions', 'admin'] },
  { title: 'Financials', url: '/financials', icon: BarChart3, allowedRoles: ['admin', 'manager', 'financials', 'user'] },
  { title: 'CRM', url: '/personel-setup', icon: Users, allowedRoles: ['admin', 'manager', 'personel-setup', 'user', 'ceo'] },
  { title: 'Data Analytics', url: '/analytics', icon: TrendingUp, allowedRoles: ['admin', 'manager', 'data-analytics', 'user'] },
];

// Hard-coded list of business tools navigation items with specific role access
const businessItems: NavigationItem[] = [
  { title: 'Invoice/Quote', url: '/invoice-quote', icon: FileText, allowedRoles: ['manager', 'user', 'invoice', 'admin'] },
  { title: 'Payroll', url: '/payroll', icon: Calculator, allowedRoles: ['manager', 'payroll', 'user', 'admin'] },
  {
    title: 'POS Admin',
    url: '/pos/products',
    icon: CreditCard,
    allowedRoles: ['manager', 'pos-admin', 'user', 'admin', 'ceo'],
    children: [
      { title: 'Products and Services', url: '/pos/products', icon: Package, allowedRoles: ['manager', 'pos-admin', 'user', 'admin'] },
      { title: 'Credit Payments', url: '/pos/credits', icon: DollarSign, allowedRoles: ['manager', 'pos-admin', 'user', 'admin'] },
      { title: 'Cash In', url: '/pos/cash', icon: Wallet, allowedRoles: ['manager', 'pos-admin', 'user', 'admin'] },
    ],
  },
  { title: 'Projections', url: '/projections', icon: TrendingUp, allowedRoles: ['admin', 'manager', 'projections', 'user'] },
  { title: 'Accounting Setup', url: '/accounting', icon: Calculator, allowedRoles: ['admin', 'accountant', 'accounting', 'user', 'ceo'] },
  { title: 'Document Management', url: '/documents', icon: FolderOpen, allowedRoles: ['admin', 'manager', 'user', 'cashier', 'accountant', 'ceo', 'documents'] },
  { title: 'Qx Chat', url: '/quant-chat', icon: MessageSquare, allowedRoles: ['admin', 'manager', 'user', 'cashier', 'accountant', 'ceo', 'chat'] },
];

// Hard-coded list of setup navigation items with specific role access
const setupItems: NavigationItem[] = [
  { title: 'User Management', url: '/user-management', icon: Users, allowedRoles: ['admin', 'ceo', 'user-management', 'user'] },
  
  { title: 'Profile Setup', url: '/profile-setup', icon: Settings, allowedRoles: ['admin', 'user', 'profile-setup', 'ceo'] },
];

// --- NEW: Zororo Phumulani Specific Items ---
const zororoItems: NavigationItem[] = [
  { title: 'Register Person', url: '/agent-signup', icon: UserPlus, allowedRoles: ['agent', 'super-agent', 'admin', 'user'] },
  { title: 'My Dashboard', url: '/agent-dashboard', icon: UserCheck, allowedRoles: ['agent',  'admin', 'user'] },
  { title: 'Agents Overview', url: '/super-agent-dashboard', icon: Users2, allowedRoles: ['super-agent', 'admin', 'user']},
];
// --- END NEW ---

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

  // --- NEW: State for AI Widget ---
  const [isAIWidgetVisible, setIsAIWidgetVisible] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const AGENT_ID = "agent_6301k54386j1fvg9nss6eda6dfgj"; // Replace with your actual agent ID

  useEffect(() => {
    // Open sub-menu if any route within it is active
    setIsPosSubMenuOpen(currentPath.startsWith('/pos/'));
    setIsPosAdminSubMenuOpen(currentPath.startsWith('/pos-admin/'));
  }, [currentPath]);

  // --- NEW: useEffect for AI Widget Script Loading ---
  useEffect(() => {
    if (!isAIWidgetVisible) {
        // If widget is hidden, ensure it's removed from the DOM container
        if (widgetContainerRef.current) {
            widgetContainerRef.current.innerHTML = '';
        }
        return; // Don't load script if not visible
    }

    // Check if the custom element already exists
    if (customElements.get('elevenlabs-convai')) {
      // If the element exists, just add it to the DOM
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = `<elevenlabs-convai agent-id="${AGENT_ID}"></elevenlabs-convai>`;
      }
      return;
    }

    // Function to load the external script
    const loadScript = () => {
      // Prevent loading script multiple times if it's already loading/loaded
      if (document.querySelector('script[src="https://unpkg.com/@elevenlabs/convai-widget-embed"]')) {
          console.log("ElevenLabs script tag already exists.");
          return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
      script.async = true;
      script.type = 'text/javascript';

      script.onload = () => {
        console.log('ElevenLabs ConvAI script loaded.');
        // Script is loaded, now we can safely add the custom element
        if (widgetContainerRef.current) {
          widgetContainerRef.current.innerHTML = `<elevenlabs-convai agent-id="${AGENT_ID}"></elevenlabs-convai>`;
        }
      };

      script.onerror = () => {
        console.error('Failed to load the ElevenLabs ConvAI script.');
        // Optionally display an error message in the UI
         if (widgetContainerRef.current) {
            widgetContainerRef.current.innerHTML = '<p style="color: red;">Failed to load AI assistant.</p>';
        }
      };

      document.head.appendChild(script);
    };

    // Load the script
    loadScript();

    // Cleanup function (removes widget instance when hidden)
    return () => {
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = '';
      }
    };
  }, [isAIWidgetVisible, AGENT_ID]); // Re-run if visibility or AGENT_ID changes
  // --- END NEW ---

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
    // Debugging: Log roles for troubleshooting
    //console.log("Checking access. User Roles:", userRoles, "Allowed Roles:", allowedRoles);
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

  // --- NEW: Determine if Zororo section should be shown ---
  const showZororoSection = hasAccess(['agent','user']) || hasAccess(['super-agent','user']);
  // --- END NEW ---

  return (
    <>
      {/* --- NEW: Fixed Position Container for the Widget --- */}
      {/* This div holds the actual widget and is positioned fixed on the screen */}
      <div
        ref={widgetContainerRef}
        className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ease-in-out ${isAIWidgetVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={{ width: '400px', height: '500px' }} // Adjust size as needed
      />
      {/* --- END NEW --- */}

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

          {/* --- NEW: Zororo Phumulani Group --- */}
          {/* Conditionally render the Zororo group */}
          {showZororoSection && (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Zororo Phumulani</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* Filter and render Zororo items based on access */}
                    {zororoItems
                      .filter((item) => hasAccess(item.allowedRoles))
                      .map((item, index) =>
                        renderMenuItem(
                          item,
                          index,
                          zororoItems.length,
                          // Calculate delay: sum of previous group item counts
                          navigationItems.filter(i => hasAccess(i.allowedRoles)).length +
                          businessItems.filter(i => hasAccess(i.allowedRoles)).length
                        )
                      )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarSeparator />
            </>
          )}
          {/* --- END NEW --- */}

          {/* Setup Group */}
          <SidebarGroup>
            <SidebarGroupLabel>Setup</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {setupItems
                  .filter((item) => hasAccess(item.allowedRoles))
                  .map((item, index) =>
                    renderMenuItem(
                      item,
                      index,
                      setupItems.length,
                      // Calculate delay: sum of previous group item counts
                      navigationItems.filter(i => hasAccess(i.allowedRoles)).length +
                      businessItems.filter(i => hasAccess(i.allowedRoles)).length +
                      (showZororoSection ? zororoItems.filter(i => hasAccess(i.allowedRoles)).length : 0)
                    )
                  )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className='p-4 border-t border-gray-200 dark:border-gray-700'>
          {/* User Info and AI Button */}
          <div className='flex items-center justify-between mb-4'> {/* Changed to justify-between */}
            <div className='flex items-center space-x-2 text-sm text-muted-foreground'>
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
            {/* --- NEW: AI Toggle Button --- */}
            {state === 'expanded' && ( // Only show button when sidebar is expanded
              <button
                onClick={() => setIsAIWidgetVisible(!isAIWidgetVisible)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label={isAIWidgetVisible ? "Hide AI Assistant" : "Show AI Assistant"}
              >
                <Bot className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            {/* --- END NEW --- */}
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
    </>
  );
}