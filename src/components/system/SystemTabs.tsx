import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CustomerManagement } from './CustomerManagement'
import { ProductManagement } from './ProductManagement'
import { SupplierManagement } from './SupplierManagement'

export function SystemTabs () {
  return (
    <Tabs defaultValue='customers' className='w-full'>
      <TabsList className='grid w-full grid-cols-2'>
        <TabsTrigger value='customers'>Customers</TabsTrigger>
        <TabsTrigger value='suppliers'>Suppliers</TabsTrigger>
        //<TabsTrigger value='products'>Products</TabsTrigger>
      </TabsList>

      <TabsContent value='customers' className='space-y-4'>
        <CustomerManagement />
      </TabsContent>

      <TabsContent value='suppliers' className='space-y-4'>
        <SupplierManagement />
      </TabsContent>

      <TabsContent value='products' className='space-y-4'>
        <ProductManagement />
      </TabsContent>
    </Tabs>
  )
}
