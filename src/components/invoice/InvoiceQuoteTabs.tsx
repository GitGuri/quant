import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InvoiceList } from './InvoiceList'
import { QuotationList } from './QuotationList'
import { PurchaseList } from './PurchaseList'

export function InvoiceQuoteTabs () {
  return (
    <Tabs defaultValue='quotations' className='w-full'>
      <TabsList className='grid w-full grid-cols-2'> 
        <TabsTrigger value='quotations'>Quotations</TabsTrigger>
        <TabsTrigger value='sales'>Sales Invoices</TabsTrigger>

        
      </TabsList>
 <TabsContent value='quotations' className='space-y-4'>
        <QuotationList />
      </TabsContent>

      <TabsContent value='sales' className='space-y-4'>
        <InvoiceList />
      </TabsContent>

     


    </Tabs>
  )
}
