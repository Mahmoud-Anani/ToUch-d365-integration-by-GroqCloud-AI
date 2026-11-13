export interface LocalizedText {
  en: string;
  ar: string;
}

export type ModuleCategory = 'sales' | 'procurement' | 'finance' | 'organization';

export interface DashboardModule {
  id: string;
  entitySet: string;
  title: LocalizedText;
  description: LocalizedText;
  category: ModuleCategory;
  /** Business-relevant fields requested from D365, in display order. */
  fields: string[];
  /** Fields that identify a record. */
  keyFields: string[];
  /** Fields checked for exact matches from a scanned barcode or QR code. */
  scanFields?: string[];
  /** Field used for the free-text module search. */
  searchField?: string;
  /** Stable default sort applied to record browsing. */
  orderBy?: string;
  /** Highlighted in the dashboard KPI strip. */
  featured?: boolean;
}

/**
 * Read-only module catalogue mapped to real D365 entity sets. Field names are
 * validated against the live metadata catalog before every query.
 */
export const DASHBOARD_MODULES: readonly DashboardModule[] = [
  {
    id: 'customers',
    entitySet: 'CustomersV3',
    title: { en: 'Customers', ar: 'العملاء' },
    description: {
      en: 'Customer accounts, groups, sales currency and credit hold status.',
      ar: 'حسابات العملاء والمجموعات وعملة المبيعات وحالة الإيقاف.',
    },
    category: 'sales',
    fields: ['CustomerAccount', 'OrganizationName', 'CustomerGroupId', 'SalesCurrencyCode', 'OnHoldStatus', 'dataAreaId'],
    keyFields: ['CustomerAccount', 'dataAreaId'],
    scanFields: ['CustomerAccount'],
    searchField: 'OrganizationName',
    orderBy: 'CustomerAccount',
    featured: true,
  },
  {
    id: 'customer-groups',
    entitySet: 'CustomerGroups',
    title: { en: 'Customer groups', ar: 'مجموعات العملاء' },
    description: {
      en: 'Customer group definitions, payment terms and tax defaults.',
      ar: 'تعريفات مجموعات العملاء وشروط الدفع والإعدادات الضريبية.',
    },
    category: 'sales',
    fields: ['CustomerGroupId', 'Description', 'PaymentTermId', 'TaxGroupId', 'dataAreaId'],
    keyFields: ['CustomerGroupId', 'dataAreaId'],
    scanFields: ['CustomerGroupId'],
    searchField: 'Description',
    orderBy: 'CustomerGroupId',
  },
  {
    id: 'vendors',
    entitySet: 'VendorsV2',
    title: { en: 'Vendors', ar: 'الموردون' },
    description: {
      en: 'Supplier accounts, vendor groups and purchasing currency.',
      ar: 'حسابات الموردين ومجموعات الموردين وعملة المشتريات.',
    },
    category: 'procurement',
    fields: ['VendorAccountNumber', 'VendorOrganizationName', 'VendorGroupId', 'CurrencyCode', 'dataAreaId'],
    keyFields: ['VendorAccountNumber', 'dataAreaId'],
    scanFields: ['VendorAccountNumber'],
    searchField: 'VendorOrganizationName',
    orderBy: 'VendorAccountNumber',
    featured: true,
  },
  {
    id: 'vendor-groups',
    entitySet: 'VendorGroups',
    title: { en: 'Vendor groups', ar: 'مجموعات الموردين' },
    description: {
      en: 'Vendor group definitions, payment terms and tax defaults.',
      ar: 'تعريفات مجموعات الموردين وشروط الدفع والإعدادات الضريبية.',
    },
    category: 'procurement',
    fields: ['VendorGroupId', 'Description', 'DefaultPaymentTermName', 'DefaultTaxGroupCode', 'dataAreaId'],
    keyFields: ['VendorGroupId', 'dataAreaId'],
    scanFields: ['VendorGroupId'],
    searchField: 'Description',
    orderBy: 'VendorGroupId',
  },
  {
    id: 'products',
    entitySet: 'ReleasedProductsV2',
    title: { en: 'Released products', ar: 'المنتجات المفرج عنها' },
    description: {
      en: 'Released item numbers, product types, sales prices and unit costs.',
      ar: 'أرقام الأصناف المفرج عنها وأنواع المنتجات وأسعار البيع وتكاليف الوحدة.',
    },
    category: 'sales',
    fields: ['ItemNumber', 'ProductNumber', 'ProductSearchName', 'ProductType', 'SalesPrice', 'UnitCost', 'dataAreaId'],
    keyFields: ['ItemNumber', 'dataAreaId'],
    scanFields: ['ItemNumber', 'ProductNumber'],
    searchField: 'ProductSearchName',
    orderBy: 'ItemNumber',
    featured: true,
  },
  {
    id: 'customer-payment-journals',
    entitySet: 'CustomerPaymentJournalHeaders',
    title: { en: 'Customer payment journals', ar: 'يوميات دفعات العملاء' },
    description: {
      en: 'Customer payment journal batches, names and posting status.',
      ar: 'دفعات يوميات مدفوعات العملاء وأسماؤها وحالة ترحيلها.',
    },
    category: 'finance',
    fields: ['JournalBatchNumber', 'JournalName', 'Description', 'IsPosted', 'dataAreaId'],
    keyFields: ['JournalBatchNumber', 'dataAreaId'],
    scanFields: ['JournalBatchNumber'],
    searchField: 'JournalName',
    orderBy: 'JournalBatchNumber',
  },
  {
    id: 'ledger-journals',
    entitySet: 'LedgerJournalHeaders',
    title: { en: 'Ledger journals', ar: 'يوميات دفتر الأستاذ' },
    description: {
      en: 'General ledger journal batches with debit, credit and posting status.',
      ar: 'دفعات يوميات دفتر الأستاذ مع المدين والدائن وحالة الترحيل.',
    },
    category: 'finance',
    fields: ['JournalBatchNumber', 'JournalName', 'Description', 'IsPosted', 'JournalTotalDebit', 'JournalTotalCredit', 'AccountingCurrency', 'dataAreaId'],
    keyFields: ['JournalBatchNumber', 'dataAreaId'],
    scanFields: ['JournalBatchNumber'],
    searchField: 'JournalName',
    orderBy: 'JournalBatchNumber',
    featured: true,
  },
  {
    id: 'expense-journals',
    entitySet: 'ExpenseJournalHeaders',
    title: { en: 'Expense journals', ar: 'يوميات المصروفات' },
    description: {
      en: 'Expense journal batches, approvers and posting status.',
      ar: 'دفعات يوميات المصروفات والمعتمدون وحالة الترحيل.',
    },
    category: 'finance',
    fields: ['JournalBatchNumber', 'JournalNameId', 'Description', 'IsPosted', 'ApprovedBy', 'dataAreaId'],
    keyFields: ['JournalBatchNumber', 'dataAreaId'],
    scanFields: ['JournalBatchNumber'],
    searchField: 'Description',
    orderBy: 'JournalBatchNumber',
  },
  {
    id: 'free-text-invoices',
    entitySet: 'FreeTextInvoiceHeaders',
    title: { en: 'Free text invoices', ar: 'الفواتير النصية' },
    description: {
      en: 'Free text invoice headers, customers, invoice dates and posting status.',
      ar: 'رؤوس الفواتير النصية والعملاء وتواريخ الفواتير وحالة الترحيل.',
    },
    category: 'finance',
    fields: ['FreeTextNumber', 'InvoiceIdentifier', 'CustomerAccount', 'InvoiceName', 'InvoiceDate', 'IsPosted', 'dataAreaId'],
    keyFields: ['InvoiceIdentifier', 'dataAreaId'],
    scanFields: ['InvoiceIdentifier', 'FreeTextNumber'],
    searchField: 'InvoiceName',
    orderBy: 'InvoiceIdentifier desc',
    featured: true,
  },
  {
    id: 'sales-orders',
    entitySet: 'SalesOrderHeadersV4',
    title: { en: 'Sales orders', ar: 'أوامر البيع' },
    description: {
      en: 'Sales order headers, statuses, totals, currency and ordering customers.',
      ar: 'رؤوس أوامر البيع وحالتها والإجماليات والعملة والعملاء.',
    },
    category: 'sales',
    fields: ['SalesOrderNumber', 'SalesOrderStatus', 'OrderTotalAmount', 'CurrencyCode', 'OrderCreationDateTime', 'InvoiceCustomerAccountNumber', 'dataAreaId'],
    keyFields: ['SalesOrderNumber', 'dataAreaId'],
    scanFields: ['SalesOrderNumber'],
    searchField: 'SalesOrderNumber',
    orderBy: 'OrderCreationDateTime desc',
  },
  {
    id: 'return-orders',
    entitySet: 'ReturnOrderHeadersV2',
    title: { en: 'Return orders', ar: 'أوامر المرتجع' },
    description: {
      en: 'Customer return orders with reason codes, statuses, totals and customers.',
      ar: 'أوامر مرتجع العملاء مع أسباب الإرجاع والحالة والإجماليات والعملاء.',
    },
    category: 'sales',
    fields: ['ReturnOrderNumber', 'CustomerReturnReasonCode', 'ReturnStatus', 'OrderTotalAmount', 'CurrencyCode', 'CustomerAccountNumber', 'ReturnDeadline', 'dataAreaId'],
    keyFields: ['ReturnOrderNumber', 'dataAreaId'],
    scanFields: ['ReturnOrderNumber'],
    searchField: 'ReturnOrderNumber',
    orderBy: 'ReturnOrderNumber desc',
  },
  {
    id: 'exchange-rates',
    entitySet: 'ExchangeRates',
    title: { en: 'Exchange rates', ar: 'أسعار الصرف' },
    description: {
      en: 'Currency conversion rates by rate type and effective date.',
      ar: 'أسعار تحويل العملات حسب نوع السعر وتاريخ السريان.',
    },
    category: 'finance',
    fields: ['RateTypeName', 'FromCurrency', 'ToCurrency', 'Rate', 'StartDate', 'EndDate'],
    keyFields: ['RateTypeName', 'FromCurrency', 'ToCurrency', 'StartDate'],
    scanFields: ['FromCurrency', 'ToCurrency'],
    searchField: 'FromCurrency',
    orderBy: 'StartDate desc',
  },
  {
    id: 'main-accounts',
    entitySet: 'MainAccounts',
    title: { en: 'Main accounts', ar: 'الحسابات الرئيسية' },
    description: {
      en: 'Chart of accounts, account types, categories and suspension status.',
      ar: 'دليل الحسابات وأنواع الحسابات والفئات وحالة الإيقاف.',
    },
    category: 'finance',
    fields: ['MainAccountId', 'ChartOfAccounts', 'MainAccountType', 'AccountCategoryDescription', 'DefaultCurrency', 'IsSuspended'],
    keyFields: ['MainAccountId', 'ChartOfAccounts'],
    scanFields: ['MainAccountId'],
    searchField: 'AccountCategoryDescription',
    orderBy: 'MainAccountId',
  },
  {
    id: 'financial-dimensions',
    entitySet: 'FinancialDimensionValues',
    title: { en: 'Financial dimensions', ar: 'الأبعاد المالية' },
    description: {
      en: 'Dimension values by financial dimension and legal entity.',
      ar: 'قيم الأبعاد حسب البعد المالي والكيان القانوني.',
    },
    category: 'organization',
    fields: ['FinancialDimension', 'LegalEntityId', 'DimensionValue', 'Description', 'IsSuspended'],
    keyFields: ['FinancialDimension', 'LegalEntityId', 'DimensionValue'],
    scanFields: ['DimensionValue'],
    searchField: 'Description',
    orderBy: 'FinancialDimension',
  },
  {
    id: 'system-users',
    entitySet: 'SystemUsers',
    title: { en: 'System users', ar: 'مستخدمو النظام' },
    description: {
      en: 'D365 user identities, companies, aliases and preferred language.',
      ar: 'هويات مستخدمي D365 والشركات والأسماء المستعارة واللغة المفضلة.',
    },
    category: 'organization',
    fields: ['UserID', 'UserName', 'PersonName', 'Alias', 'Company', 'Language'],
    keyFields: ['UserID'],
    scanFields: ['UserID'],
    searchField: 'UserName',
    orderBy: 'UserID',
    featured: true,
  },
] as const;

export function findDashboardModule(id: string): DashboardModule | undefined {
  return DASHBOARD_MODULES.find((module) => module.id === id);
}

export function localized(text: LocalizedText, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? text.ar : text.en;
}
