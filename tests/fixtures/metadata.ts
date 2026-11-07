/**
 * A compact but realistic CSDL fixture. It intentionally mirrors real D365
 * shapes: a BaseType with inherited keys/properties, an EntitySet whose name
 * differs from its EntityType, navigation properties in both directions,
 * descriptions, composite keys, binary fields and D365 enum types.
 */
export const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="Microsoft.Dynamics.DataEntities" Alias="Self" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="BaseEntity">
        <Key>
          <PropertyRef Name="dataAreaId" />
        </Key>
        <Property Name="dataAreaId" Type="Edm.String" Nullable="false" />
        <Property Name="CreatedDateTime" Type="Edm.DateTimeOffset" />
      </EntityType>

      <EntityType Name="CustomerV3" BaseType="Microsoft.Dynamics.DataEntities.BaseEntity">
        <Key>
          <PropertyRef Name="dataAreaId" />
          <PropertyRef Name="CustomerAccount" />
        </Key>
        <Property Name="CustomerAccount" Type="Edm.String" Nullable="false" />
        <Property Name="OrganizationName" Type="Edm.String" />
        <Property Name="CustomerGroupId" Type="Edm.String" />
        <Property Name="CreditLimit" Type="Edm.Decimal" />
        <Property Name="IsActive" Type="Edm.Boolean" />
        <Property Name="CustomerType" Type="Microsoft.Dynamics.DataEntities.CustType" />
        <Property Name="Logo" Type="Edm.Binary" />
        <Property Name="Notes" Type="Edm.String" />
        <NavigationProperty Name="SalesOrderHeaders" Type="Collection(Microsoft.Dynamics.DataEntities.SalesOrderHeaderV2)" Partner="Customer" />
        <Annotation Term="Microsoft.Dynamics.DataEntities.Description" String="Customer master &amp; accounts" />
      </EntityType>

      <EntityType Name="SalesOrderHeaderV2">
        <Key>
          <PropertyRef Name="dataAreaId" />
          <PropertyRef Name="SalesOrderNumber" />
        </Key>
        <Property Name="dataAreaId" Type="Edm.String" Nullable="false" />
        <Property Name="SalesOrderNumber" Type="Edm.String" Nullable="false" />
        <Property Name="OrderingCustomerAccountNumber" Type="Edm.String" />
        <Property Name="SalesOrderStatus" Type="Microsoft.Dynamics.DataEntities.SalesStatus" />
        <Property Name="TotalAmount" Type="Edm.Decimal" />
        <Property Name="OrderDate" Type="Edm.DateTimeOffset" />
        <Property Name="IsDeleted" Type="Edm.Boolean" />
        <Property Name="Notes" Type="Edm.String" />
        <NavigationProperty Name="Customer" Type="Microsoft.Dynamics.DataEntities.CustomerV3" Partner="SalesOrderHeaders" />
        <NavigationProperty Name="Lines" Type="Collection(Microsoft.Dynamics.DataEntities.SalesOrderLineV2)" Partner="Header" />
        <Annotation Term="Microsoft.Dynamics.DataEntities.LongDescription" String="Sales order headers" />
      </EntityType>

      <EntityType Name="SalesOrderLineV2">
        <Key>
          <PropertyRef Name="dataAreaId" />
          <PropertyRef Name="SalesOrderNumber" />
          <PropertyRef Name="LineNumber" />
        </Key>
        <Property Name="dataAreaId" Type="Edm.String" Nullable="false" />
        <Property Name="SalesOrderNumber" Type="Edm.String" Nullable="false" />
        <Property Name="LineNumber" Type="Edm.Decimal" Nullable="false" />
        <Property Name="ItemNumber" Type="Edm.String" />
        <Property Name="OrderedSalesQuantity" Type="Edm.Decimal" />
        <Property Name="SalesPrice" Type="Edm.Decimal" />
        <Property Name="LineAmount" Type="Edm.Decimal" />
        <NavigationProperty Name="Header" Type="Microsoft.Dynamics.DataEntities.SalesOrderHeaderV2" Partner="Lines" />
      </EntityType>

      <EntityType Name="InventoryOnHandForAI">
        <Key>
          <PropertyRef Name="dataAreaId" />
          <PropertyRef Name="ItemNumber" />
          <PropertyRef Name="WarehouseId" />
        </Key>
        <Property Name="dataAreaId" Type="Edm.String" Nullable="false" />
        <Property Name="ItemNumber" Type="Edm.String" Nullable="false" />
        <Property Name="WarehouseId" Type="Edm.String" Nullable="false" />
        <Property Name="AvailableOnHandQuantity" Type="Edm.Decimal" />
        <Property Name="UnitSymbol" Type="Edm.String" />
        <Annotation Term="Microsoft.Dynamics.DataEntities.Description" String="Inventory on hand for analytics" />
      </EntityType>

      <EntityType Name="Warehouse">
        <Key>
          <PropertyRef Name="dataAreaId" />
          <PropertyRef Name="WarehouseId" />
        </Key>
        <Property Name="dataAreaId" Type="Edm.String" Nullable="false" />
        <Property Name="WarehouseId" Type="Edm.String" Nullable="false" />
        <Property Name="WarehouseName" Type="Edm.String" />
        <Property Name="SiteId" Type="Edm.String" />
        <Property Name="IsBlocked" Type="Edm.Boolean" />
      </EntityType>

      <EntityType Name="VendorV2">
        <Key>
          <PropertyRef Name="dataAreaId" />
          <PropertyRef Name="VendorAccount" />
        </Key>
        <Property Name="dataAreaId" Type="Edm.String" Nullable="false" />
        <Property Name="VendorAccount" Type="Edm.String" Nullable="false" />
        <Property Name="VendorName" Type="Edm.String" />
        <Property Name="VendorGroupId" Type="Edm.String" />
      </EntityType>

      <EntityType Name="EmptyType" />

      <EntityContainer Name="ODataService">
        <EntitySet Name="CustomersV3" EntityType="Microsoft.Dynamics.DataEntities.CustomerV3" />
        <EntitySet Name="SalesOrderHeadersV2" EntityType="Microsoft.Dynamics.DataEntities.SalesOrderHeaderV2" />
        <EntitySet Name="SalesOrderLines" EntityType="Microsoft.Dynamics.DataEntities.SalesOrderLineV2" />
        <EntitySet Name="InventoryOnHandForAI" EntityType="Microsoft.Dynamics.DataEntities.InventoryOnHandForAI" />
        <EntitySet Name="Warehouses" EntityType="Microsoft.Dynamics.DataEntities.Warehouse" />
        <EntitySet Name="VendorsV2" EntityType="Microsoft.Dynamics.DataEntities.VendorV2" />
        <EntitySet Name="EmptyEntities" EntityType="Microsoft.Dynamics.DataEntities.EmptyType" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>
`;

export const ADVERTISED_ENTITY_SETS = [
  'CustomersV3',
  'SalesOrderHeadersV2',
  'SalesOrderLines',
  'InventoryOnHandForAI',
  'Warehouses',
  'VendorsV2',
  'EmptyEntities',
  // Advertised by GET /data but absent from $metadata:
  'AdvertisedOnlyEntity',
];
