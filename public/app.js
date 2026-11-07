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
      dashboard_kicker: 'BUSINESS OVERVIEW',
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
    },
    ar: {
      skip: 'انتقل إلى حقل الرسالة',
      brand: 'Touch El-Zanouki',
      brand_sub: 'ذكاء الأعمال · مجموعة الزنوقي',
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
      dashboard_kicker: 'نظرة عامة على الأعمال',
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
    conversations: [],
    current: null,
    sending: false,
    abort: null,
    statusSteps: [],
    health: null,
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
    newChat: $('new-chat'),
    overviewNav: $('overview-nav'),
    dashboardAsk: $('dashboard-ask'),
    conversations: $('conversation-list'),
    refreshConversations: $('refresh-conversations'),
    metadataPill: $('metadata-pill'),
    metadataText: $('metadata-text'),
    refreshMetadata: $('refresh-metadata'),
    erpStatus: $('erp-status'),
    erpStatusDot: $('erp-status-dot'),
    aiStatus: $('ai-status'),
    aiStatusDot: $('ai-status-dot'),
    catalogStatus: $('catalog-status'),
    catalogStatusDot: $('catalog-status-dot'),
    chatTitle: $('chat-title'),
    chatSubtitle: $('chat-subtitle'),
    langToggle: $('lang-toggle'),
    themeToggle: $('theme-toggle'),
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
    document.title = `${t('brand')} · ${state.lang === 'ar' ? 'ذكاء الأعمال' : 'Business Intelligence'}`;
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
    updateTitle();
    updateMetaPill(state.health ? state.health.metadata : null);
    if (state.current && !state.sending) renderConversation(state.current);
  }

  function updateTitle() {
    dom.chatTitle.textContent = state.current ? state.current.title : t('overview');
    if (state.current) {
      dom.chatSubtitle.textContent = t('subtitle_messages', {
        n: state.current.messages.length,
        when: formatRelative(state.current.updatedAt),
      });
    } else {
      dom.chatSubtitle.textContent = t('subtitle_default');
    }
  }

  function setEmptyVisible(visible) {
    dom.empty.hidden = !visible;
    dom.messages.hidden = visible;
    dom.overviewNav.classList.toggle('active', visible);
    if (visible) dom.overviewNav.setAttribute('aria-current', 'page');
    else dom.overviewNav.removeAttribute('aria-current');
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
        throw new ApiError(error.message || t('request_failed'), response.status, error.code);
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

  async function bootstrapData() {
    try {
      const data = await api('/api/conversations');
      state.conversations = Array.isArray(data && data.conversations) ? data.conversations : [];
      renderConversations();
      if (!state.current) {
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
    dom.overviewNav.addEventListener('click', newChat);
    dom.dashboardAsk.addEventListener('click', () => dom.input.focus());
    dom.menuToggle.addEventListener('click', openSidebar);
    dom.sidebarClose.addEventListener('click', closeSidebar);
    dom.sidebarBackdrop.addEventListener('click', closeSidebar);

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

    if (await redirectFromStaticPreview()) return;

    try {
      const health = await api('/api/health');
      state.health = health;
      updateMetaPill(health.metadata);
      if (health.ai && health.ai.configured === false) {
        toast(t('ai_not_configured'), true);
      }
      if (health.d365 && health.d365.configured === false) {
        toast(t('d365_setup_required'), true);
      }
    } catch (error) {
      toast(error.message, true);
    }

    await bootstrapData();
  }

  void init();
})();
