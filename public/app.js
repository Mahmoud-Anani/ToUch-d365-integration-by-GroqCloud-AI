(() => {
  'use strict';

  const LS_LANG = 'd365.lang';
  const LS_THEME = 'd365.theme';
  sessionStorage.removeItem('d365.apiKey');

  const I18N = {
    en: {
      skip: 'Skip to message input',
      brand: 'Touch El-Zanouki',
      brand_sub: 'Business intelligence · El-Zenouki Group',
      close_sidebar: 'Close sidebar',
      open_sidebar: 'Open sidebar',
      new_chat: 'New conversation',
      history: 'History',
      workspace: 'Workspace',
      overview: 'Overview',
      recent_conversations: 'Recent conversations',
      data_connection: 'Data connection',
      refresh_conversations: 'Refresh conversations',
      metadata_loading: 'Loading metadata…',
      refresh_metadata: 'Refresh metadata',
      read_only_note: 'Read-only access. No ERP records can be changed.',
      subtitle_default: 'Live ERP insights for the Touch business',
      subtitle_messages: '{n} messages · updated {when}',
      empty_title: 'A clearer view of the Touch business',
      dashboard_kicker: 'D365 INTEGRATION',
      dashboard_cta: 'Ask your first question',
      workspace_status: 'Workspace status',
      workspace_status_hint: 'A live view of the tools behind your answers',
      read_only_badge: 'READ ONLY',
      erp_source: 'ERP source',
      ai_assistant: 'AI assistant',
      business_catalog: 'Business catalog',
      status_checking: 'Checking…',
      status_configured: 'Configured',
      status_setup: 'Setup required',
      status_ready: 'Ready',
      status_unavailable: 'Unavailable',
      catalog_entities: '{n} queryable entities',
      start_with: 'Start with a question',
      suggestions_hint: 'Choose a topic to explore',
      empty_body:
        'Ask about products, stock, sales, purchasing, and more. Touch Business Intelligence checks live ERP data and shows where every answer comes from—without changing records.',
      empty_hint: 'Built around Touch appliances. Every business answer is grounded in live ERP data; partial results are clearly labelled.',
      message_label: 'Message',
      composer_placeholder: 'Ask about customers, inventory, purchase orders…',
      composer_hint: 'Enter to send · Shift+Enter for a new line',
      stop: 'Stop',
      send: 'Send message',
      disclaimer: 'Touch Business Intelligence · Read-only access. Verify important business figures before acting on them.',
      working: 'Working…',
      cancel: 'Cancel',
      confirm: 'Confirm',
      delete: 'Delete',
      rename: 'Rename',
      delete_title: 'Delete conversation?',
      delete_body: 'This removes the conversation history for this user. It cannot be undone.',
      rename_title: 'Rename conversation',
      rename_body: 'Choose a short title for this conversation.',
      no_conversations: 'No conversations yet',
      metadata_ready: 'Metadata ready · {n} queryable entities',
      metadata_stale: 'Metadata ready · stale cache',
      metadata_unavailable: 'Metadata unavailable',
      d365_not_configured: 'ERP connection not configured',
      d365_setup_required:
        'Live ERP answers are unavailable. Set D365_BASE_URL to your real environment and verify or clear D365_SCOPE in the server .env file.',
      metadata_refreshed: 'Business data catalog refreshed.',
      refreshing_metadata: 'Refreshing metadata… this can take a minute.',
      conversations_refreshed: 'Conversation list refreshed.',
      stopped: 'Generation stopped.',
      network_error: 'Unable to reach the server. Check your connection and try again.',
      request_failed: 'The request failed.',
      wait: 'Please wait for the current answer to finish.',
      no_response: 'The server returned no answer. Please try again.',
      failed_answer: 'The assistant could not complete this answer.',
      show_all: 'Show all {n} rows',
      truncated_rows: 'Showing {shown} of {total} rows returned.',
      partial_data: 'Partial data',
      complete_data: 'Complete',
      sources: 'Data sources ({n})',
      source_rows: '{n} row(s)',
      source_filter: 'Filter: {filter}',
      source_more: 'Operation: {operation}',
      rows_returned: '{n} of {total} matching rows',
      yes: 'Yes',
      no: 'No',
      meta_duration: '{s}s',
      meta_tools: 'Tools: {tools}',
      meta_tokens: '{n} tokens',
      phase_understanding: 'Understanding the question',
      phase_searching_entities: 'Finding relevant business data',
      phase_reading_metadata: 'Checking available business fields',
      phase_querying_d365: 'Retrieving business data',
      phase_analyzing_data: 'Analyzing business data',
      phase_preparing_response: 'Preparing the response',
      phase_completed: 'Completed',
      suggestion_1_title: 'Touch product range',
      suggestion_1_desc: 'Find appliance products and their live details',
      suggestion_1_prompt: 'Show me the Touch appliance products currently listed in our ERP.',
      suggestion_2_title: 'Stock by warehouse',
      suggestion_2_desc: 'See available product quantities at each location',
      suggestion_2_prompt: 'What Touch product stock is available by warehouse?',
      suggestion_3_title: 'Sales performance',
      suggestion_3_desc: 'Review recent appliance orders and sales',
      suggestion_3_prompt: 'Summarize recent Touch appliance sales using the available ERP data.',
      suggestion_4_title: 'Purchasing overview',
      suggestion_4_desc: 'Explore open orders and supplier activity',
      suggestion_4_prompt: 'Show open purchase orders for the Touch business.',
      ai_not_configured: 'The AI provider is not configured on the server. Chat will fail until GROQ_API_KEY is set.',
      error_code: 'Error: {code}',
      offline: 'Offline',
      online: 'Online',
      nav_dashboard: 'Dashboard',
      nav_chat: 'Chat',
      sidebar_label: 'Workspace navigation',
      conversations: 'Conversations',
      view_dashboard_title: 'D365 Integration Dashboard',
      view_dashboard_subtitle: 'Live Dynamics 365 · Analysis &amp; System Modules',
      view_chat_title: 'Conversations',
      view_chat_subtitle: 'Ask questions about your D365 business data',
      dashboard_title: 'Live Dynamics 365 data, one clear view',
      dashboard_body:
        'Live Dynamics 365 analysis and read-only records from the integration map, presented in one bilingual workspace.',
      dashboard_updated: 'Updated {when}',
      dashboard_loading: 'Loading dashboard…',
      dashboard_refreshed: 'Dashboard refreshed.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      open_chat: 'Ask a question',
      analysis_title: 'D365 data analysis',
      analysis_hint: 'Live counts and breakdowns from the entities used by the assistant',
      analysis_unavailable: 'Analysis unavailable.',
      analysis_groups: '{n} groups',
      analysis_scanned: '{n} records scanned',
      analysis_partial: 'Partial scan',
      analysis_top_share: 'Top {key} · {pct}%',
      chart_bar: 'Bars',
      chart_donut: 'Donut',
      chart_column: 'Columns',
      chart_sort_top: 'Top',
      chart_sort_name: 'A–Z',
      chart_sort_value: 'Value',
      chart_drill_hint: 'Select a bar to drill down',
      chart_drill_back: 'Back',
      chart_drill_loading: 'Loading details…',
      chart_drill_of: '{key} · details',
      chart_drill_by: 'Grouped by {field}',
      analysis_selected: 'Selected {key} · {n} · {pct}%',
      decision_ratio_title: 'Sales vs returns',
      decision_ratio_caption: '{returns} return orders out of {sales} sales orders',
      decision_sales_label: 'Sales',
      decision_returns_label: 'Returns',
      decision_view_sales: 'View sales orders',
      decision_view_returns: 'View return orders',
      decision_insight_high: 'Action: return rate is high — review the return reasons below.',
      decision_insight_watch: 'Watch: return rate is elevated.',
      decision_insight_low: 'Healthy: return rate is low.',
      decision_insight_unknown: 'Return rate unavailable — sales or returns could not be counted.',
      kpi_empty: 'Module counts are not available yet.',
      kpi_unavailable: 'Unavailable',
      modules_title: 'System modules',
      modules_hint: 'Browse read-only records from the integration map entities',
      modules_available: '{available} of {total} modules available',
      module_state_ok: 'Available',
      module_state_unavailable: 'Unavailable',
      module_records: '{n} records',
      module_records_unknown: 'Records',
      module_browse: 'Browse',
      module_search_label: 'Search records',
      module_search_placeholder: 'Search records…',
      search: 'Search',
      clear: 'Clear',
      previous: 'Previous',
      next: 'Next',
      page_info: '{from}–{to} of {total}',
      page_info_unknown: '{from}–{to}',
      module_loading: 'Loading records…',
      module_no_records: 'No records found.',
      module_search_hint: 'Search is not available for this module.',
      module_records_error: 'Records could not be loaded.',
      module_total_unknown: 'Total unavailable',
      close: 'Close',
      sign_out: 'Sign out',
      signed_in_as: 'Signed in as {name}',
      session_expired: 'Your session expired. Please sign in again.',
      category_sales: 'Sales',
      category_procurement: 'Procurement',
      category_finance: 'Finance',
      category_organization: 'Organization',
      status_ok: 'Live',
      status_partial: 'Partial',
    },
    ar: {
      skip: 'انتقل إلى حقل الرسالة',
      brand: 'Touch El-Zanouki',
      brand_sub: 'ذكاء الأعمال · مجموعة الزنوكي',
      close_sidebar: 'إغلاق الشريط الجانبي',
      open_sidebar: 'فتح الشريط الجانبي',
      new_chat: 'محادثة جديدة',
      history: 'السجل',
      workspace: 'مساحة العمل',
      overview: 'نظرة عامة',
      recent_conversations: 'المحادثات الأخيرة',
      data_connection: 'اتصال البيانات',
      refresh_conversations: 'تحديث المحادثات',
      metadata_loading: 'جارٍ تحميل البيانات الوصفية…',
      refresh_metadata: 'تحديث البيانات الوصفية',
      read_only_note: 'وصول للقراءة فقط. لا يمكن تعديل أي سجلات في النظام.',
      subtitle_default: 'رؤى مباشرة من نظام ERP لأعمال Touch',
      subtitle_messages: '{n} رسالة · آخر تحديث {when}',
      empty_title: 'رؤية أوضح لأعمال Touch',
      dashboard_kicker: 'تكامل D365',
      dashboard_cta: 'اطرح سؤالك الأول',
      workspace_status: 'حالة مساحة العمل',
      workspace_status_hint: 'عرض مباشر للأدوات التي تدعم إجاباتك',
      read_only_badge: 'للقراءة فقط',
      erp_source: 'مصدر ERP',
      ai_assistant: 'المساعد الذكي',
      business_catalog: 'فهرس الأعمال',
      status_checking: 'جارٍ التحقق…',
      status_configured: 'تم الإعداد',
      status_setup: 'الإعداد مطلوب',
      status_ready: 'جاهز',
      status_unavailable: 'غير متاح',
      catalog_entities: '{n} كيان قابل للاستعلام',
      start_with: 'ابدأ بسؤال',
      suggestions_hint: 'اختر موضوعاً لاستكشافه',
      empty_body:
        'اسأل عن المنتجات والمخزون والمبيعات والمشتريات وغيرها. يتحقق ذكاء أعمال Touch من بيانات النظام الفعلية ويوضح مصدر كل إجابة دون تعديل أي سجل.',
      empty_hint: 'مخصص لأعمال أجهزة Touch. كل إجابة عن الأعمال تستند إلى بيانات ERP مباشرة، وتُوضّح النتائج الجزئية.',
      message_label: 'الرسالة',
      composer_placeholder: 'اسأل عن العملاء، المخزون، أوامر الشراء…',
      composer_hint: 'Enter للإرسال · Shift+Enter لسطر جديد',
      stop: 'إيقاف',
      send: 'إرسال الرسالة',
      disclaimer: 'ذكاء أعمال Touch · وصول للقراءة فقط. تحقق من الأرقام المهمة قبل اتخاذ أي إجراء.',
      working: 'جارٍ العمل…',
      cancel: 'إلغاء',
      confirm: 'تأكيد',
      delete: 'حذف',
      rename: 'إعادة تسمية',
      delete_title: 'حذف المحادثة؟',
      delete_body: 'سيتم حذف سجل هذه المحادثة لهذا المستخدم. لا يمكن التراجع.',
      rename_title: 'إعادة تسمية المحادثة',
      rename_body: 'اختر عنواناً قصيراً لهذه المحادثة.',
      no_conversations: 'لا توجد محادثات بعد',
      metadata_ready: 'البيانات الوصفية جاهزة · {n} كيان قابل للاستعلام',
      metadata_stale: 'البيانات الوصفية جاهزة · نسخة قديمة',
      metadata_unavailable: 'البيانات الوصفية غير متاحة',
      d365_not_configured: 'لم يتم إعداد اتصال نظام ERP',
      d365_setup_required:
        'إجابات ERP المباشرة غير متاحة. اضبط D365_BASE_URL على عنوان بيئتك الفعلي، وتحقق من D365_SCOPE أو اتركه فارغاً في ملف .env على الخادم.',
      metadata_refreshed: 'تم تحديث فهرس بيانات الأعمال.',
      refreshing_metadata: 'جارٍ تحديث البيانات الوصفية… قد يستغرق دقيقة.',
      conversations_refreshed: 'تم تحديث قائمة المحادثات.',
      stopped: 'تم إيقاف التوليد.',
      network_error: 'تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مجدداً.',
      request_failed: 'فشل الطلب.',
      wait: 'يرجى الانتظار حتى انتهاء الإجابة الحالية.',
      no_response: 'لم يُرجع الخادم أي إجابة. حاول مجدداً.',
      failed_answer: 'تعذر على المساعد إكمال هذه الإجابة.',
      show_all: 'عرض كل الصفوف ({n})',
      truncated_rows: 'يتم عرض {shown} من {total} صفاً.',
      partial_data: 'بيانات جزئية',
      complete_data: 'كامل',
      sources: 'مصادر البيانات ({n})',
      source_rows: '{n} صف',
      source_filter: 'تصفية: {filter}',
      source_more: 'العملية: {operation}',
      rows_returned: '{n} من {total} صف مطابق',
      yes: 'نعم',
      no: 'لا',
      meta_duration: '{s} ثانية',
      meta_tools: 'الأدوات: {tools}',
      meta_tokens: '{n} رمز',
      phase_understanding: 'فهم السؤال',
      phase_searching_entities: 'البحث في بيانات الأعمال المناسبة',
      phase_reading_metadata: 'التحقق من حقول الأعمال المتاحة',
      phase_querying_d365: 'استرجاع بيانات الأعمال',
      phase_analyzing_data: 'تحليل بيانات الأعمال',
      phase_preparing_response: 'إعداد الإجابة',
      phase_completed: 'اكتمل',
      suggestion_1_title: 'منتجات Touch',
      suggestion_1_desc: 'اكتشف أجهزة المنزل وبياناتها الحالية',
      suggestion_1_prompt: 'اعرض منتجات أجهزة Touch المنزلية المسجلة حالياً في نظام ERP.',
      suggestion_2_title: 'المخزون حسب المخزن',
      suggestion_2_desc: 'تعرف على كميات المنتجات المتاحة في كل موقع',
      suggestion_2_prompt: 'ما مخزون منتجات Touch المتاح في كل مخزن؟',
      suggestion_3_title: 'أداء المبيعات',
      suggestion_3_desc: 'راجع طلبات ومبيعات الأجهزة الحديثة',
      suggestion_3_prompt: 'لخص أحدث مبيعات أجهزة Touch بناءً على بيانات ERP المتاحة.',
      suggestion_4_title: 'نظرة على المشتريات',
      suggestion_4_desc: 'تابع أوامر الشراء المفتوحة وحركة الموردين',
      suggestion_4_prompt: 'اعرض أوامر الشراء المفتوحة الخاصة بأعمال Touch.',
      ai_not_configured: 'مزود الذكاء الاصطناعي غير مُعد على الخادم. ستفشل المحادثة حتى يتم ضبط GROQ_API_KEY.',
      error_code: 'خطأ: {code}',
      offline: 'غير متصل',
      online: 'متصل',
      nav_dashboard: 'لوحة المعلومات',
      nav_chat: 'المحادثة',
      sidebar_label: 'التنقل في مساحة العمل',
      conversations: 'المحادثات',
      view_dashboard_title: 'لوحة تكامل D365',
      view_dashboard_subtitle: 'بيانات D365 المباشرة · التحليل ووحدات النظام',
      view_chat_title: 'المحادثات',
      view_chat_subtitle: 'اسأل عن بيانات أعمال D365',
      dashboard_title: 'رؤية واحدة واضحة للأعمال',
      dashboard_body:
        'تحليل مباشر من Dynamics 365 وسجلات للقراءة فقط من خريطة التكامل، في مساحة عمل واحدة ثنائية اللغة.',
      dashboard_updated: 'آخر تحديث {when}',
      dashboard_loading: 'جارٍ تحميل لوحة المعلومات…',
      dashboard_refreshed: 'تم تحديث لوحة المعلومات.',
      refresh: 'تحديث',
      refreshing: 'جارٍ التحديث…',
      open_chat: 'اطرح سؤالاً',
      analysis_title: 'تحليل بيانات D365',
      analysis_hint: 'أعداد وتحليلات مباشرة من الكيانات التي يستخدمها المساعد',
      analysis_unavailable: 'التحليل غير متاح.',
      analysis_groups: '{n} مجموعة',
      analysis_scanned: 'تم فحص {n} سجل',
      analysis_partial: 'فحص جزئي',
      analysis_top_share: 'الأعلى: {key} · {pct}%',
      chart_bar: 'القضبان',
      chart_donut: 'دائري',
      chart_column: 'الأعمدة',
      chart_sort_top: 'الأعلى',
      chart_sort_name: 'أبجدي',
      chart_sort_value: 'القيمة',
      chart_drill_hint: 'اختر قضباً لعرض التفاصيل',
      chart_drill_back: 'رجوع',
      chart_drill_loading: 'جارٍ تحميل التفاصيل…',
      chart_drill_of: '{key} · التفاصيل',
      chart_drill_by: 'مجمّع حسب {field}',
      analysis_selected: 'المحدد {key} · {n} · {pct}%',
      decision_ratio_title: 'المبيعات مقابل المرتجعات',
      decision_ratio_caption: '{returns} أمر مرتجع من أصل {sales} أمر بيع',
      decision_sales_label: 'المبيعات',
      decision_returns_label: 'المرتجعات',
      decision_view_sales: 'عرض أوامر البيع',
      decision_view_returns: 'عرض أوامر المرتجع',
      decision_insight_high: 'إجراء: معدل المرتجعات مرتفع — راجع أسباب المرتجعات أدناه.',
      decision_insight_watch: 'متابعة: معدل المرتجعات مرتفع قليلاً.',
      decision_insight_low: 'جيد: معدل المرتجعات منخفض.',
      decision_insight_unknown: 'معدل المرتجعات غير متاح — تعذّر عدّ المبيعات أو المرتجعات.',
      kpi_empty: 'أعداد الوحدات غير متاحة بعد.',
      kpi_unavailable: 'غير متاح',
      modules_title: 'وحدات النظام',
      modules_hint: 'استعرض سجلات للقراءة فقط من كيانات خريطة التكامل',
      modules_available: '{available} من {total} وحدة متاحة',
      module_state_ok: 'متاح',
      module_state_unavailable: 'غير متاح',
      module_records: '{n} سجل',
      module_records_unknown: 'السجلات',
      module_browse: 'استعراض',
      module_search_label: 'البحث في السجلات',
      module_search_placeholder: 'ابحث في السجلات…',
      search: 'بحث',
      clear: 'مسح',
      previous: 'السابق',
      next: 'التالي',
      page_info: '{from}–{to} من {total}',
      page_info_unknown: '{from}–{to}',
      module_loading: 'جارٍ تحميل السجلات…',
      module_no_records: 'لا توجد سجلات.',
      module_search_hint: 'البحث غير متاح لهذه الوحدة.',
      module_records_error: 'تعذر تحميل السجلات.',
      module_total_unknown: 'الإجمالي غير متاح',
      close: 'إغلاق',
      sign_out: 'تسجيل الخروج',
      signed_in_as: 'مسجل الدخول باسم {name}',
      session_expired: 'انتهت جلستك. يرجى تسجيل الدخول مجدداً.',
      category_sales: 'المبيعات',
      category_procurement: 'المشتريات',
      category_finance: 'المالية',
      category_organization: 'التنظيم',
      status_ok: 'مباشر',
      status_partial: 'جزئي',
    },
  };

  const SUGGESTIONS = [
    { key: '1', icon: '🛒' },
    { key: '2', icon: '📦' },
    { key: '3', icon: '🤝' },
    { key: '4', icon: '📊' },
  ];

  const ICONS = {
    pencil:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"></path></svg>',
    assistant:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"></path><path d="M4 7.5 12 12l8-4.5M12 12v9"></path></svg>',
  };

  const state = {
    lang: localStorage.getItem(LS_LANG) || (String(navigator.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en'),
    theme: localStorage.getItem(LS_THEME) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    view: 'dashboard',
    user: null,
    redirecting: false,
    conversations: [],
    conversationsLoaded: false,
    conversationsLoading: false,
    current: null,
    sending: false,
    abort: null,
    statusSteps: [],
    health: null,
    dashboard: {
      overview: null,
      analysis: null,
      modules: null,
      loading: false,
      loaded: false,
      error: null,
      refreshedAt: null,
    },
    activeModule: null,
    records: {
      loading: false,
      error: null,
      search: '',
      top: 25,
      skip: 0,
      data: null,
    },
    modal: null,
    modalBusy: false,
    lastFocus: null,
    toastTimer: null,
  };

  const $ = (id) => document.getElementById(id);

  const dom = {
    html: document.documentElement,
    themeColor: $('theme-color-meta'),
    connectionIndicator: $('connection-indicator'),
    sidebar: $('sidebar'),
    sidebarBackdrop: $('sidebar-backdrop'),
    sidebarClose: $('sidebar-close'),
    menuToggle: $('menu-toggle'),
    dashboardNav: $('dashboard-nav'),
    chatNav: $('chat-nav'),
    conversationSection: $('conversation-section'),
    newChat: $('new-chat'),
    conversations: $('conversation-list'),
    refreshConversations: $('refresh-conversations'),
    metadataPill: $('metadata-pill'),
    metadataText: $('metadata-text'),
    refreshMetadata: $('refresh-metadata'),
    accountCard: $('account-card'),
    accountAvatar: $('account-avatar'),
    accountName: $('account-name'),
    accountRole: $('account-role'),
    logoutBtn: $('logout-btn'),
    viewTitle: $('view-title'),
    viewSubtitle: $('view-subtitle'),
    topbarUser: $('topbar-user'),
    langToggle: $('lang-toggle'),
    themeToggle: $('theme-toggle'),
    dashboardView: $('dashboard-view'),
    dashboardScroll: $('dashboard-scroll'),
    dashboardUpdated: $('dashboard-updated'),
    refreshDashboard: $('refresh-dashboard'),
    dashboardGoChat: $('dashboard-go-chat'),
    erpStatus: $('erp-status'),
    erpStatusDot: $('erp-status-dot'),
    aiStatus: $('ai-status'),
    aiStatusDot: $('ai-status-dot'),
    catalogStatus: $('catalog-status'),
    catalogStatusDot: $('catalog-status-dot'),
    kpiGrid: $('kpi-grid'),
    decisionGrid: $('decision-grid'),
    analysisGrid: $('analysis-grid'),
    analysisStatus: $('analysis-status'),
    modulesStatus: $('modules-status'),
    moduleGrid: $('module-grid'),
    moduleBrowser: $('module-browser'),
    moduleBrowserClose: $('module-browser-close'),
    moduleBrowserCategory: $('module-browser-category'),
    moduleBrowserTitle: $('module-browser-title'),
    moduleBrowserDescription: $('module-browser-description'),
    moduleBrowserCount: $('module-browser-count'),
    moduleSearch: $('module-search'),
    moduleSearchInput: $('module-search-input'),
    moduleSearchBtn: $('module-search-btn'),
    moduleSearchClear: $('module-search-clear'),
    moduleTableWrap: $('module-table-wrap'),
    modulePrev: $('module-prev'),
    modulePageInfo: $('module-page-info'),
    moduleNext: $('module-next'),
    chatView: $('chat-view'),
    messages: $('messages'),
    empty: $('empty-state'),
    suggestions: $('suggestions'),
    statusPanel: $('status-panel'),
    statusLabel: $('status-label'),
    statusDetail: $('status-detail'),
    statusSteps: $('status-steps'),
    composer: $('composer'),
    input: $('message-input'),
    send: $('send-btn'),
    stop: $('stop-btn'),
    charCount: $('char-count'),
    modalBackdrop: $('modal-backdrop'),
    modalTitle: $('modal-title'),
    modalBody: $('modal-body'),
    modalField: $('modal-field'),
    modalInputLabel: $('modal-input-label'),
    modalInput: $('modal-input'),
    modalError: $('modal-error'),
    modalCancel: $('modal-cancel'),
    modalConfirm: $('modal-confirm'),
    toast: $('toast'),
  };

  class ApiError extends Error {
    constructor(message, status, code, retryAfterSeconds) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  function t(key, vars) {
    const dict = I18N[state.lang] || I18N.en;
    let value = dict[key] ?? I18N.en[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
      }
    }
    return value;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      switch (character) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });
  }

  function inlineMarkdown(raw) {
    let text = escapeHtml(raw);
    const codes = [];
    text = text.replace(/`([^`]+)`/g, (_match, code) => {
      const index = codes.length;
      codes.push(`<code>${code}</code>`);
      return `\u0001C${index}\u0001`;
    });
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    text = text.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    text = text.replace(/\u0001C(\d+)\u0001/g, (_match, index) => codes[Number(index)] || '');
    return text;
  }

  function splitTableRow(line) {
    let value = line.trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    if (!line.includes('|')) return false;
    const cells = splitTableRow(line);
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function startsBlock(lines, index) {
    const line = lines[index];
    if (!line) return true;
    if (/^\u0000B\d+\u0000$/.test(line.trim())) return true;
    if (/^#{1,6}\s+/.test(line)) return true;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) return true;
    if (/^>\s?/.test(line)) return true;
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) return true;
    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) return true;
    return false;
  }

  function renderMarkdown(source) {
    const blocks = [];
    let text = String(source || '').replace(/\r\n?/g, '\n');
    text = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language, code) => {
      const safeLanguage = /^[a-z0-9+#.-]{0,20}$/i.test(String(language).trim())
        ? String(language).trim()
        : '';
      const index = blocks.length;
      const languageAttr = safeLanguage ? ` data-lang="${safeLanguage}"` : '';
      blocks.push(`<pre class="code-block"${languageAttr}><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
      return `\u0000B${index}\u0000`;
    });

    const lines = text.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }

      const blockMatch = /^\u0000B(\d+)\u0000$/.exec(line.trim());
      if (blockMatch) {
        out.push(blocks[Number(blockMatch[1])] || '');
        i += 1;
        continue;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i += 1;
        }
        out.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`);
        continue;
      }

      const unordered = /^\s*[-*+]\s+/.test(line);
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      if (unordered || ordered) {
        const items = [];
        const pattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
        while (i < lines.length && pattern.test(lines[i])) {
          const match = pattern.exec(lines[i]);
          items.push(`<li>${inlineMarkdown(match ? match[1] : '')}</li>`);
          i += 1;
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const header = splitTableRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          if (isTableSeparator(lines[i])) {
            i += 1;
            continue;
          }
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        const headHtml = header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('');
        const bodyHtml = rows
          .map(
            (row) =>
              `<tr>${header
                .map((_cell, index) => `<td>${inlineMarkdown(row[index] ?? '')}</td>`)
                .join('')}</tr>`,
          )
          .join('');
        out.push(
          `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
        );
        continue;
      }

      const paragraph = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
        paragraph.push(lines[i]);
        i += 1;
      }
      out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    }
    return out.join('');
  }

  function icon(name, size) {
    const wrapper = document.createElement('span');
    wrapper.innerHTML = ICONS[name] || '';
    const svg = wrapper.firstElementChild;
    if (svg instanceof SVGElement) {
      svg.setAttribute('width', String(size || 15));
      svg.setAttribute('height', String(size || 15));
      svg.setAttribute('aria-hidden', 'true');
      return svg;
    }
    return document.createTextNode('');
  }

  function applyTheme() {
    dom.html.dataset.theme = state.theme;
    dom.themeColor.setAttribute('content', state.theme === 'dark' ? '#151d19' : '#f5f7f4');
    dom.themeToggle.setAttribute(
      'aria-label',
      state.theme === 'dark' ? (state.lang === 'ar' ? 'الوضع الفاتح' : 'Switch to light theme') : state.lang === 'ar' ? 'الوضع الداكن' : 'Switch to dark theme',
    );
  }

  function applyLanguage() {
    dom.html.lang = state.lang;
    dom.html.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `${t('brand')} · ${t(state.view === 'dashboard' ? 'view_dashboard_title' : 'view_chat_title')}`;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (key) element.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (key) element.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      const key = element.getAttribute('data-i18n-aria');
      if (key) element.setAttribute('aria-label', t(key));
    });
    dom.langToggle.textContent = state.lang === 'ar' ? 'English' : 'العربية';
    dom.langToggle.setAttribute('aria-label', state.lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    dom.modalCancel.textContent = t('cancel');
    dom.modalConfirm.textContent = t('confirm');
    renderSuggestions();
    applyTheme();
    updateViewChrome();
    updateMetaPill(state.health ? state.health.metadata : null);
    renderAccount();
    renderDashboard();
    if (state.current && !state.sending && state.view === 'chat') renderConversation(state.current);
  }

  function updateViewChrome() {
    document.title = `${t('brand')} · ${t(state.view === 'dashboard' ? 'view_dashboard_title' : 'view_chat_title')}`;
    if (state.view === 'dashboard') {
      dom.viewTitle.textContent = t('view_dashboard_title');
      dom.viewSubtitle.textContent = t('view_dashboard_subtitle');
      return;
    }
    dom.viewTitle.textContent = state.current ? state.current.title : t('view_chat_title');
    dom.viewSubtitle.textContent = state.current
      ? t('subtitle_messages', {
          n: state.current.messages.length,
          when: formatRelative(state.current.updatedAt),
        })
      : t('view_chat_subtitle');
  }

  function updateTitle() {
    if (state.view === 'chat') updateViewChrome();
  }

  function setEmptyVisible(visible) {
    dom.empty.hidden = !visible;
    dom.messages.hidden = visible;
  }

  // --- Session and account -------------------------------------------------

  function redirectToLogin() {
    if (state.redirecting) return;
    state.redirecting = true;
    const next = `${window.location.pathname}${window.location.search}`;
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    window.location.replace(`/login?next=${encodeURIComponent(safeNext)}`);
  }

  function initials(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
  }

  function renderAccount() {
    if (!state.user) {
      dom.accountCard.hidden = true;
      dom.topbarUser.hidden = true;
      return;
    }
    const name = state.user.displayName || state.user.username || '';
    dom.accountName.textContent = name;
    dom.accountRole.textContent = state.user.role || '';
    dom.accountAvatar.textContent = initials(name);
    dom.accountCard.hidden = false;
    dom.topbarUser.hidden = false;
    dom.topbarUser.textContent = t('signed_in_as', { name });
    dom.logoutBtn.title = t('sign_out');
    dom.accountCard.title = state.user.role ? `${name} · ${state.user.role}` : name;
  }

  async function logout() {
    dom.logoutBtn.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // The redirect still applies when the server cannot be reached.
    }
    state.user = null;
    window.location.replace('/login');
  }

  async function loadSession() {
    try {
      const session = await api('/api/auth/me');
      if (!session || !session.authenticated || !session.user) {
        redirectToLogin();
        return false;
      }
      state.user = session.user;
      renderAccount();
      return true;
    } catch (error) {
      if (error && error.status === 401) redirectToLogin();
      else toast(error && error.message ? error.message : t('network_error'), true);
      return false;
    }
  }

  // --- View switching ------------------------------------------------------

  function setView(view, options) {
    const next = view === 'chat' ? 'chat' : 'dashboard';
    const settings = options || {};
    state.view = next;
    dom.dashboardView.hidden = next !== 'dashboard';
    dom.chatView.hidden = next !== 'chat';
    dom.conversationSection.hidden = next !== 'chat';
    dom.dashboardNav.classList.toggle('active', next === 'dashboard');
    dom.chatNav.classList.toggle('active', next === 'chat');
    if (next === 'dashboard') dom.dashboardNav.setAttribute('aria-current', 'page');
    else dom.dashboardNav.removeAttribute('aria-current');
    if (next === 'chat') dom.chatNav.setAttribute('aria-current', 'page');
    else dom.chatNav.removeAttribute('aria-current');
    updateViewChrome();
    if (!settings.silent) closeSidebar();
    if (next === 'dashboard') {
      if (!settings.skipLoad) void ensureDashboard();
    } else {
      if (!state.conversationsLoaded) void bootstrapConversations();
      if (!settings.skipFocus) {
        window.requestAnimationFrame(() => dom.input.focus());
      }
    }
  }

  // --- Dashboard -----------------------------------------------------------

  function localizedText(value) {
    if (!value || typeof value !== 'object') return '';
    return state.lang === 'ar' ? value.ar || value.en || '' : value.en || value.ar || '';
  }

  function humanizeField(value) {
    const text = String(value || '');
    const spaced = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function categoryKey(category) {
    return `category_${category || 'organization'}`;
  }

  function formatCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? numberFormat(value) : '—';
  }

  function moduleSummary(id) {
    const overview = state.dashboard.overview;
    if (overview && Array.isArray(overview.modules)) {
      const found = overview.modules.find((module) => module.id === id);
      if (found) return found;
    }
    return null;
  }

  function moduleDefinition(id) {
    const catalog = state.dashboard.modules;
    if (catalog && Array.isArray(catalog.modules)) {
      return catalog.modules.find((module) => module.id === id) || null;
    }
    return null;
  }

  function updateDashboardChrome() {
    const dashboard = state.dashboard;
    dom.refreshDashboard.disabled = dashboard.loading;
    dom.refreshDashboard.setAttribute('aria-busy', dashboard.loading ? 'true' : 'false');
    const refreshLabel = dom.refreshDashboard.querySelector('[data-i18n="refresh"]');
    if (refreshLabel) refreshLabel.textContent = t(dashboard.loading ? 'refreshing' : 'refresh');

    if (dashboard.refreshedAt) {
      dom.dashboardUpdated.textContent = t('dashboard_updated', {
        when: formatDateTime(dashboard.refreshedAt),
      });
    } else {
      dom.dashboardUpdated.textContent = dashboard.loading ? t('dashboard_loading') : '';
    }

    const overview = dashboard.overview;
    if (overview) {
      dom.modulesStatus.textContent = t('modules_available', {
        available: numberFormat(overview.availableModules ?? 0),
        total: numberFormat(overview.totalModules ?? 0),
      });
    } else {
      dom.modulesStatus.textContent = dashboard.loading ? t('dashboard_loading') : '';
    }

    const analysis = dashboard.analysis;
    if (analysis && Array.isArray(analysis.breakdowns)) {
      const live = analysis.breakdowns.filter((item) => item.status === 'ok').length;
      dom.analysisStatus.textContent = `${numberFormat(live)} / ${numberFormat(analysis.breakdowns.length)}`;
    } else {
      dom.analysisStatus.textContent = '';
    }
  }

  function renderDashboard() {
    updateDashboardChrome();
    renderKpis();
    renderDecision();
    renderAnalysis();
    renderModules();
    if (state.activeModule) renderModuleBrowser();
  }

  function dashboardNote(message, isError) {
    const note = document.createElement('p');
    note.className = `dashboard-empty${isError ? ' error' : ''}`;
    note.textContent = message;
    return note;
  }

  function renderKpis() {
    dom.kpiGrid.replaceChildren();
    const overview = state.dashboard.overview;
    if (!overview || !Array.isArray(overview.modules) || overview.modules.length === 0) {
      const message = state.dashboard.loading
        ? t('dashboard_loading')
        : state.dashboard.error || t('kpi_empty');
      dom.kpiGrid.append(dashboardNote(message, Boolean(state.dashboard.error)));
      return;
    }

    let featured = overview.modules.filter((module) => module.featured);
    if (featured.length === 0) featured = overview.modules.slice(0, 6);

    for (const module of featured) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kpi-card${module.status === 'ok' ? '' : ' unavailable'}`;
      card.addEventListener('click', () => openModule(module.id));
      if (module.status !== 'ok' && module.error) card.title = module.error;

      const label = document.createElement('span');
      label.className = 'kpi-label';
      label.textContent = localizedText(module.title);

      const value = document.createElement('strong');
      value.className = 'kpi-value';
      value.textContent = module.status === 'ok' ? formatCount(module.count) : '—';

      const meta = document.createElement('span');
      meta.className = 'kpi-meta';
      meta.textContent =
        module.status === 'ok'
          ? `${t(categoryKey(module.category))} · ${module.entitySet}`
          : `${t('kpi_unavailable')} · ${module.entitySet}`;

      card.append(label, value, meta);
      dom.kpiGrid.append(card);
    }
  }

  function renderAnalysis() {
    dom.analysisGrid.replaceChildren();
    const analysis = state.dashboard.analysis;
    if (!analysis || !Array.isArray(analysis.breakdowns) || analysis.breakdowns.length === 0) {
      const message = state.dashboard.loading
        ? t('dashboard_loading')
        : state.dashboard.error || t('analysis_unavailable');
      dom.analysisGrid.append(dashboardNote(message, Boolean(state.dashboard.error)));
      return;
    }
    // Decision-section cards render into #decision-grid instead.
    for (const breakdown of analysis.breakdowns) {
      if (breakdown.section === 'decision') continue;
      dom.analysisGrid.append(renderBreakdownCard(breakdown));
    }
  }

  const CHART_COLORS = ['#ff5659', '#a8c26e', '#2a9d8f', '#e9c46a', '#5b8e7d', '#4ea8de', '#9d7ea8'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function groupShare(groups, group) {
    if (typeof group.share === 'number' && Number.isFinite(group.share)) return group.share;
    const total = groups.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    return total > 0 ? (Number(group.count) || 0) / total : 0;
  }

  function displayGroupKey(key) {
    const text = key === null || key === undefined ? '' : String(key).trim();
    return text === '' || text === '(blank)' ? '—' : text;
  }

  function formatShare(share) {
    const pct = Math.round((Number(share) || 0) * 1000) / 10;
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
  }

  // --- Interactive chart layer --------------------------------------------
  // One shared floating tooltip used by every chart element.
  const chartTooltip = document.createElement('div');
  chartTooltip.className = 'chart-tooltip';
  chartTooltip.setAttribute('role', 'tooltip');
  chartTooltip.hidden = true;
  document.body.append(chartTooltip);

  function formatValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value ?? '');
    return new Intl.NumberFormat(state.lang === 'ar' ? 'ar' : 'en', {
      maximumFractionDigits: 2,
    }).format(number);
  }

  function tooltipHtml(groups, group) {
    const valueTotal = groups.reduce(
      (sum, item) =>
        sum + (typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : 0),
      0,
    );
    const parts = [
      `<strong>${escapeHtml(displayGroupKey(group.key))}</strong>`,
      `${escapeHtml(formatCount(group.count))} · ${escapeHtml(formatShare(groupShare(groups, group)))}`,
    ];
    if (valueTotal > 0 && typeof group.value === 'number' && Number.isFinite(group.value)) {
      parts.push(escapeHtml(formatValue(group.value)));
    }
    return parts.join('<br>');
  }

  function showChartTooltip(event, html) {
    chartTooltip.innerHTML = html;
    chartTooltip.hidden = false;
    moveChartTooltip(event);
  }

  function moveChartTooltip(event) {
    if (chartTooltip.hidden) return;
    const pad = 14;
    const rect = chartTooltip.getBoundingClientRect();
    let left = event.clientX + pad;
    let top = event.clientY + pad;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - pad;
    chartTooltip.style.left = `${Math.max(8, left)}px`;
    chartTooltip.style.top = `${Math.max(8, top)}px`;
  }

  function hideChartTooltip() {
    chartTooltip.hidden = true;
  }

  function sortGroups(groups, mode) {
    const copy = groups.slice();
    if (mode === 'name') {
      copy.sort((a, b) => displayGroupKey(a.key).localeCompare(displayGroupKey(b.key)));
    } else if (mode === 'value') {
      copy.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    } else {
      copy.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    }
    return copy;
  }

  /**
   * Wires hover tooltip, selection, drill-down and keyboard access onto one
   * chart element. Click behaviour comes from opts.onSelect (drill or toggle).
   */
  function bindGroupElement(element, groups, group, opts) {
    const options = opts || {};
    element.classList.toggle('selected', options.selectedKey === group.key);
    element.addEventListener('pointerenter', (event) => {
      showChartTooltip(event, tooltipHtml(groups, group));
      if (options.onHover) options.onHover(group, true);
    });
    element.addEventListener('pointermove', moveChartTooltip);
    element.addEventListener('pointerleave', () => {
      hideChartTooltip();
      if (options.onHover) options.onHover(group, false);
    });
    element.addEventListener('blur', hideChartTooltip);
    if (!options.onSelect) return;
    element.addEventListener('click', () => options.onSelect(group));
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `${displayGroupKey(group.key)}: ${formatCount(group.count)}`);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        options.onSelect(group);
      }
    });
  }

  function buildBarChart(groups, opts) {
    const list = document.createElement('ul');
    list.className = 'bar-list';
    // Scale bars by the value aggregate when it carries a positive total
    // (e.g. returned order value per reason), otherwise by count.
    const valueTotal = groups.reduce(
      (sum, group) =>
        sum + (typeof group.value === 'number' && Number.isFinite(group.value) ? group.value : 0),
      0,
    );
    const useValue = valueTotal > 0;
    const metric = (group) =>
      useValue ? Number(group.value) || 0 : Number(group.count) || 0;
    const max = Math.max(...groups.map(metric), 1);
    for (const group of groups) {
      const item = document.createElement('li');
      item.className = 'bar-row';

      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = displayGroupKey(group.key);
      label.title = displayGroupKey(group.key);

      const track = document.createElement('span');
      track.className = 'bar-track';
      const fill = document.createElement('span');
      fill.className = 'bar-fill';
      fill.style.width = `${Math.max(2, Math.round((metric(group) / max) * 100))}%`;
      track.append(fill);

      const count = document.createElement('span');
      count.className = 'bar-count';
      count.textContent = useValue
        ? `${formatValue(group.value)} · ${formatShare(groupShare(groups, group))}`
        : `${formatCount(group.count)} · ${formatShare(groupShare(groups, group))}`;

      item.append(label, track, count);
      bindGroupElement(item, groups, group, opts);
      list.append(item);
    }
    return list;
  }

  function buildDonutChart(groups, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'donut-wrap';

    const size = 120;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('class', 'donut-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      groups.map((group) => `${displayGroupKey(group.key)} ${formatShare(groupShare(groups, group))}`).join(', '),
    );

    const segments = [];
    const legendEntries = [];

    // Hovering either the ring or the legend highlights both.
    const highlight = (key, on) => {
      for (const entry of [...segments, ...legendEntries]) {
        entry.element.classList.toggle('hot', Boolean(on) && entry.key === key);
      }
    };

    let start = 0;
    groups.forEach((group, index) => {
      const share = groupShare(groups, group);
      if (share <= 0) return;
      const length = share * circumference;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', size / 2);
      circle.setAttribute('cy', size / 2);
      circle.setAttribute('r', radius);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke-width', 20);
      circle.setAttribute('stroke-dasharray', `${length} ${Math.max(circumference - length, 0)}`);
      circle.setAttribute('stroke-dashoffset', -start);
      circle.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
      circle.setAttribute('class', `donut-seg seg-${index % CHART_COLORS.length}`);
      svg.append(circle);
      segments.push({ key: group.key, element: circle });
      bindGroupElement(circle, groups, group, {
        ...(opts || {}),
        onHover: (hovered, on) => highlight(hovered.key, on),
      });
      start += length;
    });

    const total = groups.reduce((sum, group) => sum + (Number(group.count) || 0), 0);
    const totalText = document.createElementNS(SVG_NS, 'text');
    totalText.setAttribute('x', size / 2);
    totalText.setAttribute('y', size / 2 + 1);
    totalText.setAttribute('text-anchor', 'middle');
    totalText.setAttribute('class', 'donut-total');
    totalText.textContent = formatCount(total);
    svg.append(totalText);
    wrap.append(svg);

    const legend = document.createElement('ul');
    legend.className = 'donut-legend';
    groups.forEach((group, index) => {
      const row = document.createElement('li');
      row.className = 'legend-row';
      const dot = document.createElement('span');
      dot.className = `seg-dot seg-${index % CHART_COLORS.length}`;
      const key = document.createElement('span');
      key.className = 'legend-key';
      key.textContent = displayGroupKey(group.key);
      key.title = displayGroupKey(group.key);
      const count = document.createElement('strong');
      count.className = 'legend-count';
      count.textContent = formatCount(group.count);
      const pct = document.createElement('span');
      pct.className = 'legend-pct';
      pct.textContent = formatShare(groupShare(groups, group));
      row.append(dot, key, count, pct);
      legend.append(row);
      legendEntries.push({ key: group.key, element: row });
      bindGroupElement(row, groups, group, {
        ...(opts || {}),
        onHover: (hovered, on) => highlight(hovered.key, on),
      });
    });
    wrap.append(legend);
    return wrap;
  }

  function buildColumnChart(groups, opts) {
    const chart = document.createElement('div');
    chart.className = 'col-chart';
    chart.setAttribute('role', 'img');
    chart.setAttribute(
      'aria-label',
      groups.map((group) => `${displayGroupKey(group.key)} ${formatCount(group.count)}`).join(', '),
    );
    const valueTotal = groups.reduce(
      (sum, group) =>
        sum + (typeof group.value === 'number' && Number.isFinite(group.value) ? group.value : 0),
      0,
    );
    const useValue = valueTotal > 0;
    const metric = (group) => (useValue ? Number(group.value) || 0 : Number(group.count) || 0);
    const max = Math.max(...groups.map(metric), 1);
    groups.forEach((group, index) => {
      const column = document.createElement('div');
      column.className = 'col';
      column.title = `${displayGroupKey(group.key)}: ${formatCount(group.count)} (${formatShare(groupShare(groups, group))})`;

      const value = document.createElement('span');
      value.className = 'col-value';
      value.textContent = useValue
        ? formatValue(group.value)
        : formatCount(group.count);

      const lane = document.createElement('span');
      lane.className = 'col-lane';
      const fill = document.createElement('span');
      fill.className = `col-fill seg-bg-${index % CHART_COLORS.length}`;
      fill.style.height = `${Math.max(4, Math.round((metric(group) / max) * 100))}%`;
      lane.append(fill);

      const key = document.createElement('span');
      key.className = 'col-key';
      key.textContent = displayGroupKey(group.key);
      key.title = displayGroupKey(group.key);

      column.append(value, lane, key);
      bindGroupElement(column, groups, group, opts);
      chart.append(column);
    });
    return chart;
  }

  function renderBreakdownCard(breakdown) {
    const card = document.createElement('article');
    card.className = `analysis-card${breakdown.section === 'decision' ? ' decision-card' : ''}`;

    // Per-card interaction state: sort mode, selected group, drill-down.
    const view = { sort: 'count', selectedKey: null, drill: null };

    const head = document.createElement('header');
    head.className = 'analysis-head';
    const title = document.createElement('h3');
    title.textContent = localizedText(breakdown.title);
    const tags = document.createElement('span');
    tags.className = 'analysis-tags';
    const chartTag = document.createElement('span');
    chartTag.className = 'chart-tag';
    chartTag.textContent = t(`chart_${breakdown.chart || 'bar'}`);
    const entity = document.createElement('span');
    entity.className = 'entity-tag';
    entity.textContent = breakdown.entitySet;
    tags.append(chartTag, entity);
    head.append(title, tags);

    const controls = document.createElement('div');
    const body = document.createElement('div');
    body.className = 'analysis-body';
    const foot = document.createElement('footer');
    foot.className = 'analysis-foot';
    card.append(head, controls, body, foot);

    const refresh = () => {
      renderChartControls(controls, breakdown, view, refresh);
      renderCardBody(body, breakdown, view, refresh);
      renderCardFoot(foot, breakdown, view);
    };
    refresh();
    return card;
  }

  function renderChartControls(container, breakdown, view, refresh) {
    container.replaceChildren();
    container.className = 'chart-controls';
    if (breakdown.status !== 'ok') return;
    const groups = Array.isArray(breakdown.groups) ? breakdown.groups : [];
    if (groups.length === 0) return;

    const valueTotal = groups.reduce(
      (sum, group) =>
        sum + (typeof group.value === 'number' && Number.isFinite(group.value) ? group.value : 0),
      0,
    );
    const hasValue = valueTotal > 0;
    const options = [
      { id: 'count', label: t('chart_sort_top') },
      ...(hasValue ? [{ id: 'value', label: t('chart_sort_value') }] : []),
      { id: 'name', label: t('chart_sort_name') },
    ];
    const cluster = document.createElement('div');
    cluster.className = 'chart-sort';
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chart-btn${view.sort === option.id ? ' active' : ''}`;
      button.textContent = option.label;
      button.setAttribute('aria-pressed', String(view.sort === option.id));
      button.addEventListener('click', () => {
        view.sort = option.id;
        refresh();
      });
      cluster.append(button);
    }
    container.append(cluster);

    if (breakdown.drillGroupByField) {
      const hint = document.createElement('span');
      hint.className = 'chart-hint';
      hint.textContent = t('chart_drill_hint');
      container.append(hint);
    }
  }

  function renderCardBody(body, breakdown, view, refresh) {
    body.replaceChildren();
    if (breakdown.status !== 'ok') {
      body.append(dashboardNote(breakdown.error || t('analysis_unavailable'), true));
      return;
    }
    const groups = Array.isArray(breakdown.groups) ? breakdown.groups : [];
    if (groups.length === 0) {
      body.append(dashboardNote(t('module_no_records'), false));
      return;
    }
    if (view.drill) {
      body.append(buildDrillPanel(breakdown, view, refresh));
      return;
    }

    const sorted = sortGroups(groups, view.sort);
    const opts = {
      selectedKey: view.selectedKey,
      onSelect: (group) => {
        if (breakdown.drillGroupByField) {
          void loadDrill(breakdown, group, view, refresh);
        } else {
          view.selectedKey = view.selectedKey === group.key ? null : group.key;
          refresh();
        }
      },
    };
    if (breakdown.chart === 'donut') body.append(buildDonutChart(sorted, opts));
    else if (breakdown.chart === 'column') body.append(buildColumnChart(sorted, opts));
    else body.append(buildBarChart(sorted, opts));
  }

  function renderCardFoot(foot, breakdown, view) {
    foot.replaceChildren();
    if (breakdown.status !== 'ok') return;
    const groups = Array.isArray(breakdown.groups) ? breakdown.groups : [];

    if (groups.length > 0) {
      const top = groups.reduce((best, group) =>
        (Number(group.count) || 0) > (Number(best.count) || 0) ? group : best,
      );
      const topShare = document.createElement('span');
      topShare.textContent = t('analysis_top_share', {
        key: displayGroupKey(top.key),
        pct: formatShare(groupShare(groups, top)).replace('%', ''),
      });
      foot.append(topShare);
    }

    const groupCount = document.createElement('span');
    groupCount.textContent = t('analysis_groups', {
      n: formatCount(breakdown.groupCount ?? groups.length),
    });
    foot.append(groupCount);
    if (typeof breakdown.recordsScanned === 'number') {
      const scanned = document.createElement('span');
      scanned.textContent = t('analysis_scanned', {
        n: formatCount(breakdown.recordsScanned),
      });
      foot.append(scanned);
    }
    if (breakdown.complete === false) {
      const badge = document.createElement('span');
      badge.className = 'badge partial';
      badge.textContent = t('analysis_partial');
      foot.append(badge);
    }
    if (view.selectedKey) {
      const selected = groups.find((group) => group.key === view.selectedKey);
      if (selected) {
        const badge = document.createElement('span');
        badge.className = 'badge selected';
        badge.textContent = t('analysis_selected', {
          key: displayGroupKey(selected.key),
          n: formatCount(selected.count),
          pct: formatShare(groupShare(groups, selected)).replace('%', ''),
        });
        foot.append(badge);
      }
    }
  }

  async function loadDrill(breakdown, group, view, refresh) {
    view.drill = { key: group.key, loading: true, error: null, data: null };
    refresh();
    try {
      const data = await api(
        `/api/dashboard/analysis/${encodeURIComponent(breakdown.id)}/drilldown?key=${encodeURIComponent(group.key)}`,
      );
      view.drill = { key: group.key, loading: false, error: null, data };
    } catch (error) {
      view.drill = {
        key: group.key,
        loading: false,
        error: (error && error.message) || t('request_failed'),
        data: null,
      };
    }
    refresh();
  }

  function buildDrillPanel(breakdown, view, refresh) {
    const panel = document.createElement('div');
    panel.className = 'drill-panel';

    const head = document.createElement('div');
    head.className = 'drill-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'chip-btn drill-back';
    back.textContent = `← ${t('chart_drill_back')}`;
    back.addEventListener('click', () => {
      view.drill = null;
      refresh();
    });
    const label = document.createElement('span');
    label.className = 'drill-label';
    label.textContent = t('chart_drill_of', { key: displayGroupKey(view.drill.key) });
    head.append(back, label);
    panel.append(head);

    const drill = view.drill;
    if (drill.loading) {
      panel.append(dashboardNote(t('chart_drill_loading'), false));
      return panel;
    }
    if (drill.error) {
      panel.append(dashboardNote(drill.error, true));
      return panel;
    }
    const data = drill.data;
    const groups = data && Array.isArray(data.groups) ? data.groups : [];
    if (groups.length === 0) {
      panel.append(dashboardNote(t('module_no_records'), false));
      return panel;
    }
    const sub = document.createElement('p');
    sub.className = 'drill-sub';
    sub.textContent = t('chart_drill_by', { field: data.groupByField || '' });
    panel.append(sub);
    panel.append(buildBarChart(sortGroups(groups, 'count'), {}));
    return panel;
  }

  // --- Decision support: sales vs returns ----------------------------------

  function renderDecision() {
    dom.decisionGrid.replaceChildren();
    const analysis = state.dashboard.analysis;
    if (!analysis) return;
    if (analysis.salesVsReturns) {
      dom.decisionGrid.append(renderRatioCard(analysis.salesVsReturns));
    }
    const breakdowns = Array.isArray(analysis.breakdowns) ? analysis.breakdowns : [];
    for (const breakdown of breakdowns) {
      if (breakdown.section === 'decision') {
        dom.decisionGrid.append(renderBreakdownCard(breakdown));
      }
    }
  }

  function renderRatioCard(metric) {
    const card = document.createElement('article');
    card.className = 'analysis-card ratio-card';

    const head = document.createElement('header');
    head.className = 'analysis-head';
    const title = document.createElement('h3');
    title.textContent = t('decision_ratio_title');
    const tags = document.createElement('span');
    tags.className = 'analysis-tags';
    const salesTag = document.createElement('span');
    salesTag.className = 'entity-tag';
    salesTag.textContent = metric.salesEntitySet;
    const returnTag = document.createElement('span');
    returnTag.className = 'entity-tag';
    returnTag.textContent = metric.returnEntitySet;
    tags.append(salesTag, returnTag);
    const partial = !metric.salesComplete || !metric.returnsComplete;
    if (partial && metric.status !== 'unavailable') {
      const badge = document.createElement('span');
      badge.className = 'badge partial';
      badge.textContent = t('analysis_partial');
      tags.append(badge);
    }
    head.append(title, tags);

    if (metric.status === 'unavailable') {
      card.append(head);
      card.append(dashboardNote(metric.error || t('decision_insight_unknown'), true));
      return card;
    }

    const rate =
      typeof metric.returnRate === 'number' && Number.isFinite(metric.returnRate)
        ? metric.returnRate
        : null;
    const salesCount =
      typeof metric.salesCount === 'number' && Number.isFinite(metric.salesCount)
        ? metric.salesCount
        : null;
    const returnCount =
      typeof metric.returnCount === 'number' && Number.isFinite(metric.returnCount)
        ? metric.returnCount
        : null;

    const body = document.createElement('div');
    body.className = 'ratio-body';

    const value = document.createElement('div');
    value.className = 'ratio-value';
    value.textContent = rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;

    const caption = document.createElement('p');
    caption.className = 'ratio-caption';
    caption.textContent = t('decision_ratio_caption', {
      returns: formatCount(returnCount),
      sales: formatCount(salesCount),
    });

    // Proportional bar: returns segment width = return rate.
    const bar = document.createElement('div');
    bar.className = 'ratio-bar';
    bar.setAttribute('role', 'img');
    const returnPct = rate === null ? 0 : Math.min(99.5, Math.max(0.5, rate * 100));
    const salesSeg = document.createElement('span');
    salesSeg.className = 'ratio-seg sales';
    salesSeg.style.width = `${(100 - returnPct).toFixed(2)}%`;
    salesSeg.textContent = formatCount(salesCount);
    const returnsSeg = document.createElement('span');
    returnsSeg.className = 'ratio-seg returns';
    returnsSeg.style.width = `${returnPct.toFixed(2)}%`;
    returnsSeg.textContent = returnPct >= 8 ? formatCount(returnCount) : '';
    bar.append(salesSeg, returnsSeg);
    bar.setAttribute(
      'aria-label',
      `${t('decision_sales_label')}: ${formatCount(salesCount)}, ${t('decision_returns_label')}: ${formatCount(returnCount)}`,
    );

    const legend = document.createElement('div');
    legend.className = 'ratio-legend';
    const legendItem = (label, count, className) => {
      const item = document.createElement('span');
      item.className = 'ratio-legend-item';
      const dot = document.createElement('span');
      dot.className = `ratio-dot ${className}`;
      const text = document.createElement('span');
      text.textContent = `${label}: ${formatCount(count)}`;
      item.append(dot, text);
      return item;
    };
    legend.append(
      legendItem(t('decision_sales_label'), salesCount, 'sales'),
      legendItem(t('decision_returns_label'), returnCount, 'returns'),
    );

    const actions = document.createElement('div');
    actions.className = 'ratio-actions';
    const salesBtn = document.createElement('button');
    salesBtn.type = 'button';
    salesBtn.className = 'chip-btn';
    salesBtn.textContent = t('decision_view_sales');
    salesBtn.addEventListener('click', () => openModule('sales-orders'));
    const returnsBtn = document.createElement('button');
    returnsBtn.type = 'button';
    returnsBtn.className = 'chip-btn';
    returnsBtn.textContent = t('decision_view_returns');
    returnsBtn.addEventListener('click', () => openModule('return-orders'));
    actions.append(salesBtn, returnsBtn);

    const insight = document.createElement('p');
    insight.className = 'ratio-insight';
    if (rate === null) {
      insight.textContent = t('decision_insight_unknown');
      insight.classList.add('unknown');
    } else if (rate > 0.05) {
      insight.textContent = t('decision_insight_high');
      insight.classList.add('high');
    } else if (rate > 0.02) {
      insight.textContent = t('decision_insight_watch');
      insight.classList.add('watch');
    } else {
      insight.textContent = t('decision_insight_low');
      insight.classList.add('low');
    }

    body.append(value, caption, bar, legend, actions, insight);
    card.append(head, body);
    return card;
  }

  function renderModules() {
    dom.moduleGrid.replaceChildren();
    const overview = state.dashboard.overview;
    let modules = overview && Array.isArray(overview.modules) ? overview.modules : [];
    if (
      modules.length === 0 &&
      state.dashboard.modules &&
      Array.isArray(state.dashboard.modules.modules)
    ) {
      modules = state.dashboard.modules.modules.map((module) => ({
        id: module.id,
        entitySet: module.entitySet,
        title: module.title,
        description: module.description,
        category: module.category,
        featured: module.featured === true,
        count: null,
        status: 'unavailable',
      }));
    }

    if (modules.length === 0) {
      const message = state.dashboard.loading
        ? t('dashboard_loading')
        : state.dashboard.error || t('kpi_empty');
      dom.moduleGrid.append(dashboardNote(message, Boolean(state.dashboard.error)));
      return;
    }

    for (const module of modules) {
      const card = document.createElement('article');
      card.className = 'module-card';
      if (state.activeModule === module.id) card.classList.add('active');

      const top = document.createElement('div');
      top.className = 'module-card-top';
      const category = document.createElement('span');
      category.className = 'module-category';
      category.textContent = t(categoryKey(module.category));
      const stateBadge = document.createElement('span');
      stateBadge.className = `module-state ${module.status === 'ok' ? 'ok' : 'warn'}`;
      stateBadge.textContent = t(
        module.status === 'ok' ? 'module_state_ok' : 'module_state_unavailable',
      );
      top.append(category, stateBadge);

      const title = document.createElement('h3');
      title.textContent = localizedText(module.title);
      const description = document.createElement('p');
      description.textContent = localizedText(module.description);

      const foot = document.createElement('div');
      foot.className = 'module-card-foot';
      const metric = document.createElement('span');
      metric.className = 'module-metric';
      if (module.status === 'ok') {
        const strong = document.createElement('strong');
        strong.textContent = formatCount(module.count);
        const suffix = document.createElement('span');
        suffix.textContent = ` ${t('module_records_unknown').toLowerCase()}`;
        metric.append(strong, suffix);
      } else {
        metric.textContent = t('module_total_unknown');
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'module-open';
      open.textContent = t('module_browse');
      open.addEventListener('click', () => openModule(module.id));
      foot.append(metric, open);

      card.append(top, title, description, foot);
      if (module.status !== 'ok' && module.error) card.title = module.error;
      dom.moduleGrid.append(card);
    }
  }

  async function ensureDashboard() {
    if (state.dashboard.loaded || state.dashboard.loading) return;
    await loadDashboard();
  }

  async function loadDashboard(options) {
    if (state.dashboard.loading) return;
    const force = Boolean(options && options.force);
    state.dashboard.loading = true;
    state.dashboard.error = null;
    updateDashboardChrome();
    renderDashboard();

    try {
      const results = await Promise.allSettled([
        api(`/api/dashboard/overview${force ? '?refresh=true' : ''}`),
        api('/api/dashboard/analysis'),
        api('/api/dashboard/modules'),
      ]);
      const [overview, analysis, modules] = results;
      if (overview.status === 'fulfilled') state.dashboard.overview = overview.value;
      if (analysis.status === 'fulfilled') state.dashboard.analysis = analysis.value;
      if (modules.status === 'fulfilled') state.dashboard.modules = modules.value;

      const failures = results.filter((result) => result.status === 'rejected');
      state.dashboard.loaded = results.some((result) => result.status === 'fulfilled');
      if (failures.length > 0) {
        const reason = failures[0].reason;
        state.dashboard.error = reason && reason.message ? reason.message : t('request_failed');
      }
      state.dashboard.refreshedAt = new Date().toISOString();
      if (force) toast(state.dashboard.error || t('dashboard_refreshed'), Boolean(state.dashboard.error));
    } catch (error) {
      state.dashboard.error = error && error.message ? error.message : t('request_failed');
      toast(state.dashboard.error, true);
    } finally {
      state.dashboard.loading = false;
      renderDashboard();
      updateDashboardChrome();
    }
  }

  // --- Module record browser ----------------------------------------------

  function openModule(id) {
    const summary = moduleSummary(id);
    const definition = moduleDefinition(id);
    if (!summary && !definition) return;
    state.activeModule = id;
    state.records = { loading: true, error: null, search: '', top: 25, skip: 0, data: null };
    setView('dashboard', { silent: true });
    dom.moduleBrowser.hidden = false;
    renderDashboard();
    void loadModuleRecords();
    window.requestAnimationFrame(() => {
      try {
        dom.moduleBrowser.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // Older browsers can ignore smooth scrolling.
      }
    });
  }

  function closeModule() {
    state.activeModule = null;
    state.records = { loading: false, error: null, search: '', top: 25, skip: 0, data: null };
    dom.moduleBrowser.hidden = true;
    dom.moduleBrowserTitle.textContent = '';
    dom.moduleBrowserDescription.textContent = '';
    dom.moduleBrowserCategory.textContent = '';
    dom.moduleBrowserCount.textContent = '';
    dom.moduleTableWrap.replaceChildren();
    dom.modulePageInfo.textContent = '';
    renderModules();
  }

  function renderModuleBrowser() {
    if (!state.activeModule) return;
    const summary = moduleSummary(state.activeModule);
    const definition = moduleDefinition(state.activeModule);
    const title = summary ? summary.title : definition ? definition.title : null;
    const description = summary ? summary.description : definition ? definition.description : null;
    const category = summary ? summary.category : definition ? definition.category : '';
    const entitySet = summary ? summary.entitySet : definition ? definition.entitySet : '';

    dom.moduleBrowser.hidden = false;
    dom.moduleBrowserTitle.textContent = localizedText(title) || state.activeModule;
    dom.moduleBrowserDescription.textContent = localizedText(description) || '';
    dom.moduleBrowserCategory.textContent = category
      ? `${t(categoryKey(category))} · ${entitySet}`
      : entitySet;

    const supportsSearch = Boolean(definition && definition.searchField);
    dom.moduleSearch.hidden = !supportsSearch;
    dom.moduleSearchInput.disabled = !supportsSearch || state.records.loading;
    dom.moduleSearchBtn.disabled = !supportsSearch || state.records.loading;
    dom.moduleSearchClear.disabled =
      !supportsSearch || state.records.loading || !state.records.search;
    if (!supportsSearch) dom.moduleSearchInput.value = '';
    else if (document.activeElement !== dom.moduleSearchInput) {
      dom.moduleSearchInput.value = state.records.search;
    }

    const data = state.records.data;
    if (data && data.module) {
      dom.moduleBrowserCount.textContent =
        typeof data.total === 'number'
          ? t('module_records', { n: formatCount(data.total) })
          : t('module_records_unknown');
    } else {
      dom.moduleBrowserCount.textContent = '';
    }

    renderModuleTable();
    renderModulePager();
  }

  function renderModuleTable() {
    dom.moduleTableWrap.replaceChildren();
    if (state.records.loading) {
      dom.moduleTableWrap.append(dashboardNote(t('module_loading'), false));
      return;
    }
    if (state.records.error) {
      dom.moduleTableWrap.append(
        dashboardNote(state.records.error || t('module_records_error'), true),
      );
      return;
    }

    const data = state.records.data;
    if (!data || !Array.isArray(data.records) || data.records.length === 0) {
      dom.moduleTableWrap.append(dashboardNote(t('module_no_records'), false));
      return;
    }

    const columns =
      Array.isArray(data.columns) && data.columns.length > 0
        ? data.columns
        : Object.keys(data.records[0] || {}).map((name) => ({ name, kind: 'unknown' }));

    const wrap = document.createElement('div');
    wrap.className = 'data-table-wrap module-table';
    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const column of columns) {
      const th = document.createElement('th');
      th.textContent = humanizeField(column.name);
      th.title = column.name;
      headRow.append(th);
    }
    thead.append(headRow);

    const tbody = document.createElement('tbody');
    for (const record of data.records) {
      const tr = document.createElement('tr');
      for (const column of columns) {
        const td = document.createElement('td');
        const value = record ? record[column.name] : null;
        td.textContent = formatCell(value, column.kind);
        if (column.kind === 'number') td.className = 'num';
        tr.append(td);
      }
      tbody.append(tr);
    }

    table.append(thead, tbody);
    wrap.append(table);
    dom.moduleTableWrap.append(wrap);
  }

  function renderModulePager() {
    const data = state.records.data;
    const loading = state.records.loading;
    const records = data && Array.isArray(data.records) ? data.records : [];
    const skip = data && typeof data.skip === 'number' ? data.skip : state.records.skip;
    const total = data && typeof data.total === 'number' ? data.total : null;
    const from = records.length > 0 ? skip + 1 : 0;
    const to = skip + records.length;

    if (records.length === 0) {
      dom.modulePageInfo.textContent = '';
    } else if (total !== null) {
      dom.modulePageInfo.textContent = t('page_info', {
        from: formatCount(from),
        to: formatCount(to),
        total: formatCount(total),
      });
    } else {
      dom.modulePageInfo.textContent = t('page_info_unknown', {
        from: formatCount(from),
        to: formatCount(to),
      });
    }

    dom.modulePrev.disabled = loading || skip <= 0;
    dom.moduleNext.disabled = loading || !(data && data.hasMore);
  }

  async function loadModuleRecords() {
    if (!state.activeModule) return;
    const moduleId = state.activeModule;
    state.records.loading = true;
    state.records.error = null;
    renderModuleBrowser();

    const params = new URLSearchParams();
    params.set('top', String(state.records.top));
    params.set('skip', String(state.records.skip));
    if (state.records.search) params.set('search', state.records.search);

    try {
      const data = await api(
        `/api/dashboard/modules/${encodeURIComponent(moduleId)}/records?${params.toString()}`,
      );
      if (state.activeModule !== moduleId) return;
      state.records.data = data;
      state.records.error = null;
      if (typeof data.top === 'number') state.records.top = data.top;
      if (typeof data.skip === 'number') state.records.skip = data.skip;
    } catch (error) {
      if (state.activeModule !== moduleId) return;
      state.records.error = error && error.message ? error.message : t('module_records_error');
      state.records.data = null;
    } finally {
      if (state.activeModule === moduleId) {
        state.records.loading = false;
        renderModuleBrowser();
      }
    }
  }

  function submitModuleSearch(event) {
    event.preventDefault();
    if (!state.activeModule || state.records.loading) return;
    state.records.search = dom.moduleSearchInput.value.trim();
    state.records.skip = 0;
    void loadModuleRecords();
  }

  function clearModuleSearch() {
    if (!state.activeModule || state.records.loading) return;
    state.records.search = '';
    state.records.skip = 0;
    dom.moduleSearchInput.value = '';
    void loadModuleRecords();
  }

  function renderSuggestions() {
    dom.suggestions.replaceChildren();
    for (const suggestion of SUGGESTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'suggestion-icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = suggestion.icon;
      const text = document.createElement('span');
      text.className = 'suggestion-text';
      const title = document.createElement('strong');
      title.textContent = t(`suggestion_${suggestion.key}_title`);
      const description = document.createElement('span');
      description.textContent = t(`suggestion_${suggestion.key}_desc`);
      text.append(title, description);
      button.append(iconSpan, text);
      button.addEventListener('click', () => {
        if (state.sending) {
          toast(t('wait'));
          return;
        }
        const prompt = t(`suggestion_${suggestion.key}_prompt`);
        dom.input.value = prompt;
        updateComposer();
        void sendMessage(prompt);
      });
      dom.suggestions.append(button);
    }
  }

  function formatRelative(iso) {
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp)) return '';
    const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
    const locale = state.lang === 'ar' ? 'ar' : 'en';
    try {
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const absolute = Math.abs(diffSeconds);
      if (absolute < 60) return formatter.format(diffSeconds, 'second');
      if (absolute < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
      if (absolute < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
      if (absolute < 604800) return formatter.format(Math.round(diffSeconds / 86400), 'day');
    } catch {
      // fall through
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(timestamp));
  }

  function formatDateTime(iso) {
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp)) return '';
    try {
      return new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(timestamp));
    } catch {
      return iso;
    }
  }

  function numberFormat(value) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return String(value);
    try {
      return new Intl.NumberFormat(state.lang === 'ar' ? 'ar-EG' : 'en-US', {
        maximumFractionDigits: 6,
      }).format(number);
    } catch {
      return String(number);
    }
  }

  function formatCell(value, type) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? t('yes') : t('no');
    if (typeof value === 'number' || type === 'number') return numberFormat(value);
    return String(value);
  }

  function toast(message, isError) {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.className = `toast${isError ? ' error' : ''}`;
    dom.toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      dom.toast.hidden = true;
      state.toastTimer = null;
    }, 4_800);
  }

  function apiHeaders(extra) {
    return Object.assign({ Accept: 'application/json' }, extra || {});
  }

  async function redirectFromStaticPreview() {
    const hostname = window.location.hostname.toLowerCase();
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!isLoopback || window.location.port === '3000') return false;

    try {
      const response = await fetch('/api/health', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        return false;
      }
    } catch {
      // Static preview servers may not implement API routes at all.
    }

    const backendUrl = new URL(window.location.href);
    backendUrl.hostname = '127.0.0.1';
    backendUrl.port = '3000';
    backendUrl.pathname = '/';
    backendUrl.search = '';
    backendUrl.hash = '';
    window.location.replace(backendUrl.toString());
    return true;
  }

  async function api(path, options) {
    const settings = options || {};
    const headers = apiHeaders();
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(path, {
        method: settings.method || 'GET',
        headers,
        ...(settings.body !== undefined ? { body: JSON.stringify(settings.body) } : {}),
      });
    } catch {
      throw new ApiError(t('network_error'), 0, 'NETWORK');
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = (payload && payload.error) || {};
      if (response.status === 401 && path !== '/api/auth/me') redirectToLogin();
      throw new ApiError(
        error.message || t('request_failed'),
        response.status,
        error.code || 'HTTP_ERROR',
        error.retryAfterSeconds,
      );
    }
    return payload;
  }

  function updateDashboardStatus() {
    const setStatus = (label, dot, message, level) => {
      if (!label || !dot) return;
      label.textContent = message;
      dot.classList.remove('ok', 'warn', 'error');
      if (level) dot.classList.add(level);
    };
    const health = state.health;

    if (!health) {
      setStatus(dom.erpStatus, dom.erpStatusDot, t('status_checking'), '');
      setStatus(dom.aiStatus, dom.aiStatusDot, t('status_checking'), '');
      setStatus(dom.catalogStatus, dom.catalogStatusDot, t('status_checking'), '');
      return;
    }

    const d365Ready = Boolean(health.d365 && health.d365.configured);
    setStatus(
      dom.erpStatus,
      dom.erpStatusDot,
      d365Ready ? t('status_configured') : t('status_setup'),
      d365Ready ? 'ok' : 'error',
    );

    const ai = health.ai;
    const aiAvailable =
      Boolean(ai && ai.configured) &&
      (!Array.isArray(ai.providers) ||
        ai.providers.length === 0 ||
        ai.providers.some((provider) => provider.available));
    setStatus(
      dom.aiStatus,
      dom.aiStatusDot,
      aiAvailable ? t('status_ready') : ai && ai.configured ? t('status_unavailable') : t('status_setup'),
      aiAvailable ? 'ok' : 'error',
    );

    const metadata = health.metadata;
    if (metadata && metadata.loaded) {
      const count = metadata.queryableEntityCount ?? metadata.entityCount ?? 0;
      const formattedCount = new Intl.NumberFormat(state.lang === 'ar' ? 'ar' : 'en').format(count);
      setStatus(
        dom.catalogStatus,
        dom.catalogStatusDot,
        t('catalog_entities', { n: formattedCount }),
        metadata.stale ? 'warn' : 'ok',
      );
    } else {
      setStatus(dom.catalogStatus, dom.catalogStatusDot, t('status_unavailable'), 'error');
    }
  }

  function updateMetaPill(metadata) {
    updateDashboardStatus();
    dom.metadataPill.classList.remove('ok', 'warn', 'error');
    if (metadata && metadata.loaded) {
      const status = metadata.stale ? 'warn' : 'ok';
      dom.metadataPill.classList.add(status);
      dom.metadataText.textContent = metadata.stale
        ? t('metadata_stale')
        : t('metadata_ready', { n: metadata.queryableEntityCount ?? metadata.entityCount ?? 0 });
      dom.metadataPill.title = metadata.fetchedAt
        ? `${formatDateTime(metadata.fetchedAt)}${metadata.stale ? ' · stale' : ''}`
        : '';
      dom.connectionIndicator.classList.remove('ok', 'warn', 'error');
      dom.connectionIndicator.classList.add(status);
      return;
    }
    if (state.health && state.health.d365 && state.health.d365.configured === false) {
      dom.metadataPill.classList.add('error');
      dom.metadataText.textContent = t('d365_not_configured');
    } else {
      dom.metadataPill.classList.add('warn');
      dom.metadataText.textContent = t('metadata_loading');
    }
    dom.metadataPill.title =
      state.health && Array.isArray(state.health.warnings) ? state.health.warnings.join(' ') : '';
    dom.connectionIndicator.classList.remove('ok', 'warn', 'error');
    dom.connectionIndicator.classList.add(
      dom.metadataPill.classList.contains('error') ? 'error' : 'warn',
    );
  }

  function renderConversations() {
    dom.conversations.replaceChildren();
    if (state.conversations.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-history';
      empty.textContent = t('no_conversations');
      dom.conversations.append(empty);
      return;
    }

    for (const conversation of state.conversations) {
      const row = document.createElement('div');
      row.className = 'conv-row';
      if (state.current && state.current.id === conversation.id) row.classList.add('active');

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'conv-main';
      main.title = formatDateTime(conversation.updatedAt);
      const title = document.createElement('span');
      title.className = 'conv-title';
      title.textContent = conversation.title || t('new_chat');
      const preview = document.createElement('span');
      preview.className = 'conv-preview';
      preview.textContent = conversation.preview || formatRelative(conversation.updatedAt);
      main.append(title, preview);
      main.addEventListener('click', () => {
        void loadConversation(conversation.id);
      });

      const actions = document.createElement('div');
      actions.className = 'conv-actions';
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'icon-btn';
      rename.setAttribute('aria-label', t('rename'));
      rename.title = t('rename');
      rename.append(icon('pencil', 14));
      rename.addEventListener('click', (event) => {
        event.stopPropagation();
        void renameConversation(conversation);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.setAttribute('aria-label', t('delete'));
      remove.title = t('delete');
      remove.append(icon('trash', 14));
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        void deleteConversation(conversation);
      });
      actions.append(rename, remove);
      row.append(main, actions);
      dom.conversations.append(row);
    }
  }

  async function refreshConversations(showToast) {
    try {
      const data = await api('/api/conversations');
      state.conversations = Array.isArray(data && data.conversations) ? data.conversations : [];
      state.conversationsLoaded = true;
      renderConversations();
      if (showToast) toast(t('conversations_refreshed'));
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function loadConversation(id, options) {
    if (state.sending) {
      toast(t('wait'));
      return;
    }
    setView('chat', { silent: true, skipFocus: true });
    try {
      const data = await api(`/api/conversations/${encodeURIComponent(id)}`);
      state.current = data.conversation;
      renderConversation(state.current);
      renderConversations();
      closeSidebar();
    } catch (error) {
      if (error.status === 404) {
        toast(error.message, true);
        await refreshConversations(false);
      } else {
        toast(error.message, true);
      }
      if (!options || !options.silent) setEmptyVisible(!state.current || state.current.messages.length === 0);
    }
  }

  function newChat() {
    if (state.sending) {
      toast(t('wait'));
      return;
    }
    setView('chat', { silent: true, skipFocus: true });
    state.current = null;
    dom.messages.replaceChildren();
    setEmptyVisible(true);
    updateTitle();
    renderConversations();
    updateComposer();
    closeSidebar();
    dom.input.focus();
  }

  function renderConversation(conversation) {
    dom.messages.replaceChildren();
    if (!conversation || conversation.messages.length === 0) {
      setEmptyVisible(true);
      updateTitle();
      return;
    }
    setEmptyVisible(false);
    for (const message of conversation.messages) {
      dom.messages.append(renderMessage(message));
    }
    updateTitle();
    scrollToBottom(true);
  }

  function renderMessage(message, options) {
    const article = document.createElement('article');
    article.className = `message ${message.role}`;
    if (options && options.error) article.classList.add('message-error');
    if (message.id) article.dataset.messageId = message.id;

    if (message.role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.innerHTML = ICONS.assistant;
      article.append(avatar);
    }

    const body = document.createElement('div');
    body.className = 'message-body';

    if (options && options.error) {
      const errorText = document.createElement('div');
      errorText.className = 'plain-text';
      errorText.textContent = options.error;
      body.append(errorText);
    } else if (message.role === 'user') {
      const text = document.createElement('div');
      text.className = 'plain-text';
      text.dir = 'auto';
      text.textContent = message.content;
      body.append(text);
    } else {
      const prose = document.createElement('div');
      prose.className = 'prose';
      prose.dir = 'auto';
      prose.innerHTML = renderMarkdown(message.content || '…');
      body.append(prose);
    }

    if (message.attachments && message.attachments.length > 0) {
      const attachments = document.createElement('div');
      attachments.className = 'attachments';
      for (const attachment of message.attachments) {
        attachments.append(renderAttachment(attachment));
      }
      body.append(attachments);
    }

    if (message.sources && message.sources.length > 0) {
      body.append(renderSources(message.sources));
    }

    if (message.role === 'assistant' && message.meta) {
      body.append(renderMessageMeta(message.meta));
    }

    if (options && options.failed) {
      const failed = document.createElement('div');
      failed.className = 'message-meta';
      const label = document.createElement('span');
      label.className = 'message-failed';
      label.textContent = t('failed_answer');
      failed.append(label);
      body.append(failed);
    }

    article.append(body);
    return article;
  }

  function renderMessageMeta(meta) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-meta';
    if (meta.model) {
      const model = document.createElement('span');
      model.textContent = meta.model;
      wrapper.append(model);
    }
    if (typeof meta.durationMs === 'number') {
      const duration = document.createElement('span');
      duration.textContent = t('meta_duration', { s: (meta.durationMs / 1000).toFixed(1) });
      wrapper.append(duration);
    }
    if (Array.isArray(meta.toolsUsed) && meta.toolsUsed.length > 0) {
      const tools = document.createElement('span');
      tools.textContent = t('meta_tools', { tools: meta.toolsUsed.join(', ') });
      wrapper.append(tools);
    }
    if (meta.usage && typeof meta.usage.totalTokens === 'number') {
      const tokens = document.createElement('span');
      tokens.textContent = t('meta_tokens', { n: numberFormat(meta.usage.totalTokens) });
      wrapper.append(tokens);
    }
    if (meta.complete === false) {
      const badge = document.createElement('span');
      badge.className = 'badge partial';
      badge.textContent = t('partial_data');
      wrapper.append(badge);
    }
    return wrapper;
  }

  function renderAttachment(attachment) {
    const card = document.createElement('section');
    card.className = 'attachment-card';

    const head = document.createElement('div');
    head.className = 'attachment-head';
    const title = document.createElement('span');
    title.className = 'attachment-title';
    title.textContent = attachment.title || attachment.type;
    head.append(title);
    if (attachment.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.className = 'attachment-subtitle';
      subtitle.textContent = attachment.subtitle;
      head.append(subtitle);
    }
    card.append(head);

    const body = document.createElement('div');
    body.className = 'attachment-body';

    if (attachment.type === 'table') {
      const columns =
        Array.isArray(attachment.columns) && attachment.columns.length > 0
          ? attachment.columns
          : Object.keys((attachment.rows && attachment.rows[0]) || {}).map((key) => ({ key, label: key }));
      const rows = Array.isArray(attachment.rows) ? attachment.rows : [];
      const wrap = document.createElement('div');
      wrap.className = 'data-table-wrap';
      const table = document.createElement('table');
      table.className = 'data-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const column of columns) {
        const th = document.createElement('th');
        th.textContent = column.label || column.key;
        headRow.append(th);
      }
      thead.append(headRow);
      const tbody = document.createElement('tbody');
      table.append(thead, tbody);
      wrap.append(table);
      body.append(wrap);

      const initial = 50;
      let rendered = 0;
      function appendRows(limit) {
        const slice = rows.slice(rendered, limit);
        for (const row of slice) {
          const tr = document.createElement('tr');
          for (const column of columns) {
            const td = document.createElement('td');
            const value = row ? row[column.key] : null;
            td.textContent = formatCell(value, column.type);
            if (column.type === 'number') td.className = 'num';
            tr.append(td);
          }
          tbody.append(tr);
        }
        rendered += slice.length;
      }
      appendRows(initial);

      if (rows.length > initial) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'more-btn';
        more.textContent = t('show_all', { n: rows.length });
        more.addEventListener('click', () => {
          appendRows(rows.length);
          more.remove();
        });
        body.append(more);
      }
      if (attachment.truncated || (typeof attachment.totalRows === 'number' && attachment.totalRows > rows.length)) {
        const note = document.createElement('p');
        note.className = 'attachment-note';
        note.textContent = t('truncated_rows', {
          shown: rows.length,
          total: attachment.totalRows ?? rows.length,
        });
        body.append(note);
      }
    } else if (attachment.type === 'chart') {
      body.append(renderChart(attachment));
    } else if (attachment.type === 'metric') {
      const grid = document.createElement('div');
      grid.className = 'metric-grid';
      for (const item of attachment.items || []) {
        const cell = document.createElement('div');
        cell.className = 'metric-item';
        const label = document.createElement('span');
        label.className = 'metric-label';
        label.textContent = item.label;
        const value = document.createElement('span');
        value.className = 'metric-value';
        value.textContent = item.value;
        cell.append(label, value);
        if (item.hint) {
          const hint = document.createElement('span');
          hint.className = 'metric-hint';
          hint.textContent = item.hint;
          cell.append(hint);
        }
        grid.append(cell);
      }
      body.append(grid);
    }

    card.append(body);
    return card;
  }

  function truncateLabel(value, max) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function renderChart(attachment) {
    const labels = Array.isArray(attachment.labels) ? attachment.labels : [];
    const values = Array.isArray(attachment.values) ? attachment.values : [];
    const entries = [];
    for (let index = 0; index < Math.min(labels.length, values.length, 12); index += 1) {
      const value = Number(values[index]);
      if (Number.isFinite(value)) entries.push({ label: String(labels[index] ?? ''), value });
    }

    if (entries.length === 0) {
      const note = document.createElement('p');
      note.className = 'attachment-note';
      note.textContent = '—';
      return note;
    }

    const ns = 'http://www.w3.org/2000/svg';
    const width = 720;
    const rowHeight = 34;
    const top = 10;
    const labelWidth = 220;
    const valueWidth = 74;
    const plotWidth = width - labelWidth - valueWidth - 16;
    const height = top * 2 + entries.length * rowHeight;
    const min = Math.min(0, ...entries.map((entry) => entry.value));
    const max = Math.max(0, ...entries.map((entry) => entry.value));
    const span = max - min || 1;
    const x = (value) => 8 + labelWidth + ((value - min) / span) * plotWidth;
    const baseline = x(0);

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', attachment.title || 'Chart');

    const axis = document.createElementNS(ns, 'line');
    axis.setAttribute('x1', String(baseline));
    axis.setAttribute('x2', String(baseline));
    axis.setAttribute('y1', String(top));
    axis.setAttribute('y2', String(height - top));
    axis.setAttribute('class', 'chart-axis');
    svg.append(axis);

    entries.forEach((entry, index) => {
      const y = top + index * rowHeight;
      const valueX = x(entry.value);
      const bar = document.createElementNS(ns, 'rect');
      bar.setAttribute('x', String(Math.min(valueX, baseline)));
      bar.setAttribute('y', String(y + 5));
      bar.setAttribute('width', String(Math.max(0.8, Math.abs(valueX - baseline))));
      bar.setAttribute('height', '18');
      bar.setAttribute('class', `chart-bar${entry.value < 0 ? ' negative' : ''}`);
      const barTitle = document.createElementNS(ns, 'title');
      barTitle.textContent = `${entry.label}: ${numberFormat(entry.value)}`;
      bar.append(barTitle);
      svg.append(bar);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', String(labelWidth));
      label.setAttribute('y', String(y + 18));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 'chart-label');
      label.textContent = truncateLabel(entry.label, 30);
      const labelTitle = document.createElementNS(ns, 'title');
      labelTitle.textContent = entry.label;
      label.append(labelTitle);
      svg.append(label);

      const value = document.createElementNS(ns, 'text');
      const positive = entry.value >= 0;
      value.setAttribute('x', String(positive ? valueX + 6 : valueX - 6));
      value.setAttribute('y', String(y + 18));
      value.setAttribute('text-anchor', positive ? 'start' : 'end');
      value.setAttribute('class', 'chart-value');
      value.textContent = numberFormat(entry.value);
      svg.append(value);
    });

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.append(svg);
    return wrap;
  }

  function renderSources(sources) {
    const details = document.createElement('details');
    details.className = 'sources';
    const summary = document.createElement('summary');
    summary.textContent = t('sources', { n: sources.length });
    details.append(summary);

    const list = document.createElement('ul');
    list.className = 'source-list';
    for (const source of sources) {
      const item = document.createElement('li');
      item.className = 'source-item';
      const head = document.createElement('div');
      head.className = 'source-head';
      const entity = document.createElement('span');
      entity.className = 'source-entity';
      entity.textContent = source.entitySet || source.entityType || 'D365';
      head.append(entity);
      const badge = document.createElement('span');
      badge.className = `badge ${source.complete ? 'ok' : 'partial'}`;
      badge.textContent = source.complete ? t('complete_data') : t('partial_data');
      head.append(badge);
      item.append(head);

      const meta = document.createElement('span');
      meta.className = 'source-meta';
      const rowText =
        typeof source.totalMatches === 'number'
          ? t('rows_returned', { n: source.rowsReturned ?? 0, total: source.totalMatches })
          : t('source_rows', { n: source.rowsReturned ?? 0 });
      meta.textContent = `${t('source_more', { operation: source.operation || 'query' })} · ${rowText}`;
      item.append(meta);

      if (source.filter) {
        const filter = document.createElement('span');
        filter.className = 'source-meta';
        filter.textContent = t('source_filter', { filter: source.filter });
        item.append(filter);
      }
      if (source.notes && source.notes.length > 0) {
        const note = document.createElement('span');
        note.className = 'source-note';
        note.textContent = source.notes.join(' ');
        item.append(note);
      }
      list.append(item);
    }
    details.append(list);
    return details;
  }

  function renderStatusEvent(update) {
    dom.statusPanel.hidden = false;
    const labelKey = `phase_${update.phase}`;
    const label = t(labelKey);
    dom.statusLabel.textContent = label;
    dom.statusDetail.textContent = [update.tool, update.entitySet, update.detail].filter(Boolean).join(' · ');

    const key = `${update.phase}|${update.tool || ''}|${update.entitySet || ''}`;
    const last = state.statusSteps[state.statusSteps.length - 1];
    if (!last || last.key !== key) {
      state.statusSteps.push({ key, label });
      if (state.statusSteps.length > 8) state.statusSteps.shift();
    } else {
      last.label = label;
    }
    renderStatusSteps();
  }

  function renderStatusSteps() {
    dom.statusSteps.replaceChildren();
    state.statusSteps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'status-step';
      if (index === state.statusSteps.length - 1) item.classList.add('active');
      else item.classList.add('done');
      item.textContent = step.label;
      dom.statusSteps.append(item);
    });
  }

  function hideStatus() {
    dom.statusPanel.hidden = true;
    dom.statusSteps.replaceChildren();
    dom.statusLabel.textContent = t('working');
    dom.statusDetail.textContent = '';
    state.statusSteps = [];
  }

  function scrollToBottom(force) {
    requestAnimationFrame(() => {
      if (force || dom.messages.scrollHeight - dom.messages.scrollTop - dom.messages.clientHeight < 180) {
        dom.messages.scrollTop = dom.messages.scrollHeight;
      }
    });
  }

  function updateComposer() {
    const length = dom.input.value.length;
    const hasText = dom.input.value.trim().length > 0;
    dom.send.disabled = state.sending || !hasText;
    dom.stop.hidden = !state.sending;
    dom.charCount.textContent = length > 3_200 ? `${length} / 4000` : '';
    dom.charCount.classList.toggle('limit', length > 3_800);
    const lines = dom.input.value.split('\n').length;
    dom.input.rows = Math.max(1, Math.min(6, lines));
  }

  async function consumeSse(response, onEvent) {
    if (!response.body) throw new ApiError(t('no_response'), 0, 'NO_BODY');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const parseBlock = (block) => {
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length === 0) return;
      try {
        onEvent(event, JSON.parse(data.join('\n')));
      } catch {
        // Ignore malformed progress events; the final event is authoritative.
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        parseBlock(block);
        boundary = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) parseBlock(buffer);
  }

  async function sendMessage(rawText) {
    const text = String(rawText || '').trim();
    if (!text || state.sending) return;

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    dom.messages.append(renderMessage(tempMessage));
    setEmptyVisible(false);
    scrollToBottom(true);

    state.sending = true;
    state.abort = new AbortController();
    state.statusSteps = [];
    updateComposer();
    dom.statusPanel.hidden = false;
    dom.statusLabel.textContent = t('phase_understanding');
    dom.statusDetail.textContent = '';
    dom.statusSteps.replaceChildren();
    dom.input.value = '';
    updateComposer();

    let ready = false;
    let finalConversation = null;
    let sawError = false;

    const handleEvent = (event, data) => {
      if (event === 'ready') {
        ready = true;
        if (!state.current) {
          state.current = {
            id: data.conversationId,
            title: data.title || t('new_chat'),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
          };
        } else {
          state.current.title = data.title || state.current.title;
        }
        if (data.userMessage && data.userMessage.id) {
          const tempElement = dom.messages.querySelector(`[data-message-id="${tempId}"]`);
          if (tempElement) tempElement.dataset.messageId = data.userMessage.id;
        }
        updateTitle();
      } else if (event === 'status' && data) {
        renderStatusEvent(data);
      } else if (event === 'final' && data) {
        if (data.conversation) {
          finalConversation = data.conversation;
          state.current = data.conversation;
          renderConversation(data.conversation);
        }
        hideStatus();
        void refreshConversations(false);
      } else if (event === 'error') {
        sawError = true;
        hideStatus();
        const error = (data && data.error) || {};
        const message =
          error.message ||
          (error.code ? t('error_code', { code: error.code }) : t('failed_answer'));
        if (!ready) {
          const tempElement = dom.messages.querySelector(`[data-message-id="${tempId}"]`);
          if (tempElement) tempElement.remove();
          setEmptyVisible(dom.messages.children.length === 0);
        } else {
          dom.messages.append(renderMessage({ id: `error-${Date.now()}`, role: 'assistant', content: message, createdAt: new Date().toISOString() }, { error: message }));
        }
        toast(message, true);
      }
    };

    try {
      const headers = apiHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          ...(state.current && state.current.id ? { conversationId: state.current.id } : {}),
          locale: state.lang,
        }),
        signal: state.abort.signal,
      });

      if (!response.ok) {
        const raw = await response.text();
        let payload = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
        const error = (payload && payload.error) || {};
        if (response.status === 401) redirectToLogin();
        throw new ApiError(
          response.status === 401 ? t('session_expired') : error.message || t('request_failed'),
          response.status,
          error.code,
        );
      }

      await consumeSse(response, handleEvent);

      if (!finalConversation && !sawError) {
        if (!ready) {
          const tempElement = dom.messages.querySelector(`[data-message-id="${tempId}"]`);
          if (tempElement) tempElement.remove();
        }
        dom.messages.append(
          renderMessage(
            { id: `error-${Date.now()}`, role: 'assistant', content: t('no_response'), createdAt: new Date().toISOString() },
            { error: t('no_response') },
          ),
        );
        setEmptyVisible(false);
        toast(t('no_response'), true);
      }
    } catch (error) {
      hideStatus();
      if (error && error.name === 'AbortError') {
        toast(t('stopped'));
        if (!ready) {
          const tempElement = dom.messages.querySelector(`[data-message-id="${tempId}"]`);
          if (tempElement) tempElement.remove();
          setEmptyVisible(dom.messages.children.length === 0);
        }
      } else {
        if (!ready) {
          const tempElement = dom.messages.querySelector(`[data-message-id="${tempId}"]`);
          if (tempElement) tempElement.remove();
        }
        const message = error && error.message ? error.message : t('failed_answer');
        if (ready) {
          dom.messages.append(
            renderMessage(
              { id: `error-${Date.now()}`, role: 'assistant', content: message, createdAt: new Date().toISOString() },
              { error: message },
            ),
          );
        }
        setEmptyVisible(dom.messages.children.length === 0);
        toast(message, true);
      }
    } finally {
      state.sending = false;
      state.abort = null;
      hideStatus();
      updateComposer();
      if (finalConversation) {
        setEmptyVisible(false);
        scrollToBottom(true);
      } else if (state.current && state.current.id) {
        void refreshConversations(false);
      }
    }
  }

  function openSidebar() {
    dom.sidebar.classList.add('open');
    dom.sidebarBackdrop.hidden = false;
  }

  function closeSidebar() {
    dom.sidebar.classList.remove('open');
    dom.sidebarBackdrop.hidden = true;
  }

  async function renameConversation(conversation) {
    const result = await openModal({
      title: t('rename_title'),
      body: t('rename_body'),
      input: true,
      inputLabel: t('rename_title'),
      inputValue: conversation.title,
      confirmText: t('rename'),
      onConfirm: (value) => {
        const title = String(value || '').trim();
        if (!title) return false;
        return api(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
          method: 'PATCH',
          body: { title },
        }).then(() => {
          toast(t('rename'));
          return true;
        });
      },
    });
    if (result) {
      if (state.current && state.current.id === conversation.id) {
        state.current.title = result;
        updateTitle();
      }
      await refreshConversations(false);
    }
  }

  async function deleteConversation(conversation) {
    const confirmed = await openModal({
      title: t('delete_title'),
      body: t('delete_body'),
      confirmText: t('delete'),
      danger: true,
      onConfirm: () =>
        api(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
          method: 'DELETE',
        }).then(() => true),
    });
    if (confirmed) {
      if (state.current && state.current.id === conversation.id) newChat();
      await refreshConversations(false);
    }
  }

  function openModal(options) {
    if (state.modal) closeModal(false);
    state.lastFocus = document.activeElement;
    state.modal = { options, resolve: null };
    const promise = new Promise((resolve) => {
      if (state.modal) state.modal.resolve = resolve;
    });

    dom.modalTitle.textContent = options.title || '';
    dom.modalBody.textContent = options.body || '';
    dom.modalBody.hidden = !options.body;
    dom.modalField.hidden = !options.input;
    dom.modalError.hidden = true;
    dom.modalError.textContent = '';
    dom.modalConfirm.classList.toggle('danger', Boolean(options.danger));
    dom.modalConfirm.textContent = options.confirmText || t('confirm');
    dom.modalCancel.hidden = Boolean(options.hideCancel);
    if (options.input) {
      dom.modalInputLabel.textContent = options.inputLabel || '';
      dom.modalInput.type = options.inputType || 'text';
      dom.modalInput.value = options.inputValue || '';
      dom.modalInput.placeholder = options.inputPlaceholder || '';
      dom.modalInput.autocomplete = options.inputType === 'password' ? 'current-password' : 'off';
    }
    dom.modalBackdrop.hidden = false;
    setTimeout(() => {
      (options.input ? dom.modalInput : dom.modalConfirm).focus();
    }, 10);
    return promise;
  }

  function closeModal(value) {
    if (!state.modal) return;
    const modal = state.modal;
    state.modal = null;
    state.modalBusy = false;
    dom.modalBackdrop.hidden = true;
    dom.modalConfirm.disabled = false;
    if (modal.resolve) modal.resolve(value);
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
      try {
        state.lastFocus.focus();
      } catch {
        // ignore
      }
    }
    state.lastFocus = null;
  }

  async function handleModalConfirm() {
    if (!state.modal || state.modalBusy) return;
    const options = state.modal.options;
    const value = options.input ? dom.modalInput.value : undefined;
    state.modalBusy = true;
    dom.modalConfirm.disabled = true;
    try {
      const result = options.onConfirm ? await options.onConfirm(value) : true;
      if (result === false) {
        state.modalBusy = false;
        dom.modalConfirm.disabled = false;
        return;
      }
      closeModal(result === undefined ? value || true : result);
    } catch (error) {
      state.modalBusy = false;
      dom.modalConfirm.disabled = false;
      dom.modalError.textContent = error.message || t('request_failed');
      dom.modalError.hidden = false;
    }
  }

  async function loadHealth() {
    try {
      const health = await api('/api/health');
      state.health = health;
      updateMetaPill(health.metadata);
      updateDashboardStatus();
      if (health.ai && health.ai.configured === false) {
        toast(t('ai_not_configured'), true);
      }
      if (health.d365 && health.d365.configured === false) {
        toast(t('d365_setup_required'), true);
      }
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function bootstrapConversations() {
    if (state.conversationsLoaded || state.conversationsLoading) return;
    state.conversationsLoading = true;
    try {
      const data = await api('/api/conversations');
      state.conversations = Array.isArray(data && data.conversations) ? data.conversations : [];
      state.conversationsLoaded = true;
      renderConversations();
      if (!state.current && state.view === 'chat') {
        setEmptyVisible(true);
        updateTitle();
      }
      try {
        const metadata = await api('/api/metadata/status');
        if (state.health) state.health.metadata = metadata;
        updateMetaPill(metadata);
      } catch {
        // Metadata status is non-critical; health already showed a summary.
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.conversationsLoading = false;
    }
  }

  async function refreshMetadata() {
    dom.refreshMetadata.disabled = true;
    toast(t('refreshing_metadata'));
    try {
      const status = await api('/api/metadata/refresh', { method: 'POST' });
      if (state.health) state.health.metadata = status;
      updateMetaPill(status);
      toast(t('metadata_refreshed'));
    } catch (error) {
      toast(error.message, true);
    } finally {
      dom.refreshMetadata.disabled = false;
    }
  }

  function bindEvents() {
    dom.composer.addEventListener('submit', (event) => {
      event.preventDefault();
      if (state.sending) return;
      void sendMessage(dom.input.value);
    });

    dom.input.addEventListener('input', updateComposer);
    dom.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!state.sending && dom.input.value.trim()) void sendMessage(dom.input.value);
      }
    });

    dom.stop.addEventListener('click', () => {
      if (state.abort) state.abort.abort();
    });

    dom.newChat.addEventListener('click', newChat);
    dom.dashboardNav.addEventListener('click', () => setView('dashboard'));
    // chatNav and dashboardGoChat are hidden: dashboard is the only primary view
    if (dom.chatNav && !dom.chatNav.hidden) dom.chatNav.addEventListener('click', () => setView('chat'));
    if (dom.dashboardGoChat && !dom.dashboardGoChat.hidden) dom.dashboardGoChat.addEventListener('click', () => setView('chat'));
    dom.refreshDashboard.addEventListener('click', () => {
      void loadDashboard({ force: true });
    });
    dom.menuToggle.addEventListener('click', openSidebar);
    dom.sidebarClose.addEventListener('click', closeSidebar);
    dom.sidebarBackdrop.addEventListener('click', closeSidebar);

    dom.moduleBrowserClose.addEventListener('click', closeModule);
    dom.moduleSearch.addEventListener('submit', submitModuleSearch);
    dom.moduleSearchClear.addEventListener('click', clearModuleSearch);
    dom.modulePrev.addEventListener('click', () => {
      if (state.records.loading || state.records.skip <= 0) return;
      state.records.skip = Math.max(0, state.records.skip - state.records.top);
      void loadModuleRecords();
    });
    dom.moduleNext.addEventListener('click', () => {
      if (state.records.loading) return;
      const data = state.records.data;
      if (!data || !data.hasMore) return;
      state.records.skip += state.records.top;
      void loadModuleRecords();
    });
    dom.logoutBtn.addEventListener('click', () => {
      void logout();
    });

    dom.refreshConversations.addEventListener('click', () => {
      void refreshConversations(true);
    });
    dom.refreshMetadata.addEventListener('click', () => {
      void refreshMetadata();
    });

    dom.langToggle.addEventListener('click', () => {
      state.lang = state.lang === 'ar' ? 'en' : 'ar';
      localStorage.setItem(LS_LANG, state.lang);
      applyLanguage();
    });

    dom.themeToggle.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(LS_THEME, state.theme);
      applyTheme();
    });

    dom.modalCancel.addEventListener('click', () => closeModal(false));
    dom.modalConfirm.addEventListener('click', () => {
      void handleModalConfirm();
    });
    dom.modalBackdrop.addEventListener('click', (event) => {
      if (event.target === dom.modalBackdrop) closeModal(false);
    });
    dom.modalInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void handleModalConfirm();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (state.modal) closeModal(false);
        else if (state.view === 'dashboard' && state.activeModule) closeModule();
        else closeSidebar();
      }
    });
  }

  async function init() {
    bindEvents();
    applyLanguage();
    applyTheme();
    updateComposer();
    setEmptyVisible(true);
    updateViewChrome();

    if (await redirectFromStaticPreview()) return;
    if (!(await loadSession())) return;

    await loadHealth();
    await loadDashboard();
    void bootstrapConversations();
  }

  void init();
})();
