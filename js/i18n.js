/**
 * KrishiSetu — Frontend Internationalization (i18n) Engine
 * 
 * Provides a lightweight, dependency-free multilingual foundation supporting
 * English (en, default) and Hindi (hi). Architected for extensible addition of
 * future Indian languages (Marathi, Punjabi, Bengali, Telugu, Tamil, etc.).
 * 
 * Fully compatible with browser SPA DOM rendering and Node.js test environments.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KrishiSetuI18n = factory();
    root.I18n = root.KrishiSetuI18n;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'krishisetu_language';
  const DEFAULT_LANGUAGE = 'en';

  const SUPPORTED_LANGUAGES = {
    en: { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
    hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
    mr: { code: 'mr', name: 'Marathi', nativeName: 'मराठी', dir: 'ltr' },
    pa: { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr' },
    te: { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr' }
  };

  const translations = {
    en: {
      common: {
        search: 'Search',
        submit: 'Submit',
        cancel: 'Cancel',
        save: 'Save',
        edit: 'Edit',
        delete: 'Delete',
        close: 'Close',
        back: 'Back',
        next: 'Next',
        loading: 'Loading…',
        error: 'Error',
        success: 'Success',
        confirm: 'Confirm',
        yes: 'Yes',
        no: 'No',
        viewAll: 'View All',
        details: 'Details',
        filter: 'Filter',
        clear: 'Clear',
        status: 'Status',
        action: 'Action',
        all: 'All',
        na: 'N/A',
        kg: 'kg',
        quintal: 'quintal',
        rupee: '₹'
      },
      nav: {
        home: 'Home',
        dashboard: 'Dashboard',
        marketplace: 'Marketplace',
        mandiRates: 'Mandi Rates',
        sellProducts: 'Sell Products',
        orders: 'Orders',
        aboutUs: 'About Us',
        detectLocation: 'Detect Location',
        viewCart: 'View Cart',
        notifications: 'Alerts & Notifications',
        backgroundAlerts: 'Background Alerts',
        enableAlerts: 'Enable Alerts',
        testAlert: 'Test (3s Delay)',
        soundOn: 'Sound On',
        soundOff: 'Sound Off',
        markAllRead: 'Mark All Read',
        quickCheckup: 'Platform Quick Checkup (All Systems)',
        login: 'Login',
        logout: 'Logout',
        profile: 'Profile',
        myDashboard: 'My Dashboard',
        feedback: 'Platform Feedback',
        selectLanguage: 'Language / भाषा'
      },
      landing: {
        badge: 'Direct Farm-to-Consumer Agricultural Platform',
        heroTitle: 'Direct Farm-to-Buyer Marketplace',
        heroSubtitle: 'Connecting verified farmers and FPOs directly with consumers and retail buyers with live mandi intelligence and transparent quality verification.',
        browseMarketplace: 'Browse Marketplace',
        startSelling: 'Start Selling',
        checkMandiPrices: 'Check Mandi Prices',
        zeroMiddlemen: 'Zero Middlemen',
        zeroMiddlemenDesc: 'Farmers receive full value for their produce directly from buyers without unfair agent commissions.',
        fairPricesGuaranteed: 'Fair Prices Guaranteed',
        fairPricesGuaranteedDesc: 'Prices anchored to live official APMC mandi arrival benchmarks and transparent quality grades.',
        mandiBenchmarked: 'Government Mandi Benchmarked',
        mandiBenchmarkedDesc: 'Direct integration with AGMARKNET government mandi data feeds for verified daily market rates.',
        traceableQuality: 'Traceable Quality',
        traceableQualityDesc: 'Seller-declared and photo-evidenced produce quality grades with transparent dispute resolution.',
        statsFarmers: 'Verified Farmers',
        statsCommodities: 'Major Crops Tracked',
        statsMandis: 'APMC Mandis Covered',
        statsCommission: 'Platform Intermediary Fee'
      },
      marketplace: {
        title: 'Explore Fresh Harvest',
        subtitle: 'Direct from verified local farms and farmer producer organizations',
        searchPlaceholder: 'Search fresh produce, grains, fruits, vegetables…',
        categories: 'Categories',
        allProduce: 'All Produce',
        vegetables: 'Vegetables',
        fruits: 'Fruits',
        grains: 'Grains & Cereals',
        pulses: 'Pulses & Legumes',
        spices: 'Spices',
        filterByState: 'Filter by State',
        allStates: 'All States',
        addToCart: '+ CART',
        inStock: 'In Stock',
        outOfStock: 'OUT OF STOCK',
        verifiedFarmer: 'Verified Farmer ✓',
        viewOnly: 'View Only',
        perKg: 'per kg',
        availableKg: '{count} kg available',
        noProductsFound: 'No produce listings found matching your criteria.'
      },
      cart: {
        title: 'Shopping Cart',
        empty: 'Your cart is empty',
        emptySubtitle: 'Explore our farm-fresh marketplace to add produce directly from farmers.',
        orderSummary: 'Order Summary',
        subtotal: 'Produce Subtotal',
        platformFee: 'Platform Convenience Fee',
        deliveryCharges: 'Delivery / Handling',
        totalPayable: 'Total Payable',
        proceedToCheckout: 'Proceed to Checkout',
        continueShopping: 'Continue Shopping',
        remove: 'Remove'
      },
      orders: {
        title: 'Orders & Tracking',
        subtitle: 'Track your farm produce orders from harvest confirmation to delivery',
        orderNumber: 'Order #{number}',
        orderPlaced: 'Order Placed',
        farmerConfirmed: 'Farmer Confirmed',
        preparing: 'Preparing Dispatch',
        ready: 'Out for Delivery',
        completed: 'Delivered',
        cancelled: 'Cancelled',
        rejected: 'Rejected',
        placedOn: 'Placed on {date}',
        trackDelivery: 'Track Order',
        viewDetails: 'View Details',
        fileDispute: 'Report Dispute',
        noOrders: 'No orders placed yet.'
      },
      price: {
        title: 'Live Mandi Intelligence',
        subtitle: 'Real-time APMC mandi market rates sourced from AGMARKNET & data.gov.in',
        selectCommodity: 'Select Commodity',
        selectState: 'Select State',
        selectDistrict: 'Select District',
        selectMarket: 'Select APMC Market',
        arrivalDate: 'Arrival Date',
        modalPrice: 'Modal Price',
        minPrice: 'Min Price',
        maxPrice: 'Max Price',
        unitQuintal: '₹/quintal',
        trendAnalysis: 'Historical Price Trend',
        compareMandis: 'Compare Mandis',
        liveBadge: 'LIVE GOVERNMENT FEED',
        disclaimer: 'Data refreshed daily from official Agricultural Marketing Information Network.'
      },
      sell: {
        title: 'List Your Produce',
        subtitle: 'Sell your harvested crops directly to buyers at transparent prices',
        commodityName: 'Commodity Name',
        category: 'Category',
        quantity: 'Available Quantity',
        unitPrice: 'Unit Price (₹ per kg)',
        grade: 'Produce Quality Grade',
        harvestDate: 'Harvest Date',
        location: 'Farm Location',
        description: 'Harvest Description',
        uploadPhotos: 'Upload Produce Photos / Quality Evidence',
        submitListing: 'Submit Listing',
        myListings: 'My Active Listings'
      },
      about: {
        title: 'About KrishiSetu',
        subtitle: 'Bridging the gap between Indian farmers and consumers',
        missionTitle: 'Our Mission',
        missionText: 'KrishiSetu is an open, transparent agricultural marketplace engineered to eliminate predatory middlemen, provide verified mandi price intelligence, and establish verifiable quality trust between farmers and buyers.',
        pillarDataTrust: 'Data Trust: Zero price fabrication; strictly verified AGMARKNET mandi feeds.',
        pillarQualityTrust: 'Quality Trust: Transparent grade declarations backed by immutable photographic evidence.',
        pillarTransactionTrust: 'Transaction Trust: Step-by-step order tracking with auditable dispute protocols.'
      },
      auth: {
        signInTitle: 'Sign In to KrishiSetu',
        signUpTitle: 'Create an Account',
        contactLabel: 'Mobile Number or Email',
        passwordLabel: 'Password',
        nameLabel: 'Full Name',
        roleLabel: 'I want to:',
        roleBuyer: 'Buy Fresh Produce (Consumer / Retailer)',
        roleSeller: 'Sell Harvest (Farmer / FPO)',
        signInBtn: 'Sign In',
        signUpBtn: 'Create Account',
        forgotPassword: 'Forgot Password?',
        or: 'OR'
      },
      chat: {
        title: 'KrishiSetu AI Assistant',
        subtitle: 'Grounded Agricultural AI',
        welcomeMessage: 'Namaste! I am your KrishiSetu AI Assistant. How can I help you today with crops, mandi rates, product quality, or marketplace orders?',
        inputPlaceholder: 'Ask about crops, mandi rates, quality...',
        send: 'Send',
        clear: 'Clear conversation',
        close: 'Close',
        typing: 'Thinking...',
        signInRequired: 'Sign in to chat with KrishiSetu Assistant',
        signInPrompt: 'Sign in to your account to ask questions about mandi rates, product quality, and your orders.',
        promptQuality: 'How is product quality checked?',
        promptMandi: 'Check Mandi Rates',
        promptBuy: 'How to buy produce?',
        promptSell: 'How to sell harvest?',
        errorGeneric: 'Sorry, I encountered an issue. Please try again.',
        aiUnavailable: 'AI assistant service is currently unavailable. Please try again later.'
      },
      voice: {
        startListening: 'Start voice input (Speak)',
        stopListening: 'Stop listening',
        listening: 'Listening... Speak now',
        processing: 'Processing speech...',
        speakResponse: 'Listen to response',
        stopSpeaking: 'Stop speaking',
        speaking: 'Speaking...',
        autoSpeechOn: 'Auto-voice enabled',
        autoSpeechOff: 'Auto-voice disabled',
        toggleAutoSpeech: 'Toggle auto voice response',
        unsupported: 'Voice input is not supported in this browser. Please type your question.',
        permissionDenied: 'Microphone access was denied. Please allow microphone permissions in browser settings.',
        noSpeech: 'No speech was detected. Please tap the microphone and try speaking again.',
        recognitionError: 'Voice recognition encountered an issue. Please try again or type your message.',
        speechUnavailable: 'Speech synthesis is not supported or available on this device.'
      }
    },
    hi: {
      common: {
        search: 'खोजें',
        submit: 'जमा करें',
        cancel: 'रद्द करें',
        save: 'सहेजें',
        edit: 'संपादित करें',
        delete: 'हटाएं',
        close: 'बंद करें',
        back: 'पीछे जाएं',
        next: 'आगे बढ़ें',
        loading: 'लोड हो रहा है…',
        error: 'त्रुटि',
        success: 'सफलता',
        confirm: 'पुष्टि करें',
        yes: 'हाँ',
        no: 'नहीं',
        viewAll: 'सभी देखें',
        details: 'विवरण',
        filter: 'फ़िल्टर',
        clear: 'साफ़ करें',
        status: 'स्थिति',
        action: 'कार्रवाई',
        all: 'सभी',
        na: 'लागू नहीं',
        kg: 'किग्रा',
        quintal: 'क्विंटल',
        rupee: '₹'
      },
      nav: {
        home: 'होम',
        dashboard: 'डैशबोर्ड',
        marketplace: 'मंडी बाज़ार',
        mandiRates: 'मंडी भाव',
        sellProducts: 'उपज बेचें',
        orders: 'ऑर्डर ट्रैकिंग',
        aboutUs: 'हमारे बारे में',
        detectLocation: 'स्थान पहचानें',
        viewCart: 'कार्ट देखें',
        notifications: 'अलर्ट और सूचनाएं',
        backgroundAlerts: 'बैकग्राउंड अलर्ट',
        enableAlerts: 'अलर्ट सक्षम करें',
        testAlert: 'परीक्षण (3 सेकंड)',
        soundOn: 'ध्वनि चालू',
        soundOff: 'ध्वनि बंद',
        markAllRead: 'सभी पढ़ा हुआ चिह्नित करें',
        quickCheckup: 'प्लेटफ़ॉर्म त्वरित जांच',
        login: 'लॉगिन करें',
        logout: 'लॉगआउट',
        profile: 'प्रोफ़ाइल',
        myDashboard: 'मेरा डैशबोर्ड',
        feedback: 'फ़ीडबैक दें',
        selectLanguage: 'भाषा / Language'
      },
      landing: {
        badge: 'खेत से सीधे उपभोक्ता तक पारदर्शी कृषि मंच',
        heroTitle: 'सीधे खेत से खरीदार तक कृषि बाज़ार',
        heroSubtitle: 'सत्यापित किसानों और FPO को सीधे उपभोक्ताओं और खुदरा खरीदारों से जोड़ना — लाइव मंडी भाव और पारदर्शी गुणवत्ता प्रमाणन के साथ।',
        browseMarketplace: 'मंडी बाज़ार देखें',
        startSelling: 'उपज बेचना शुरू करें',
        checkMandiPrices: 'मंडी भाव देखें',
        zeroMiddlemen: 'बिचौलियों से मुक्ति',
        zeroMiddlemenDesc: 'किसानों को उनकी उपज का पूरा दाम मिले सीधे खरीदारों से, बिना किसी अनुचित कमीशन या दलाली के।',
        fairPricesGuaranteed: 'पारदर्शी और उचित मूल्य',
        fairPricesGuaranteedDesc: 'दैनिक आधिकारिक मंडी भाव और पारदर्शी गुणवत्ता ग्रेडिंग के आधार पर तय की गई प्रामाणिक दरें।',
        mandiBenchmarked: 'सरकारी मंडी बेंचमार्क',
        mandiBenchmarkedDesc: 'भारत सरकार के AGMARKNET पोर्टल से दैनिक सत्यापित मंडी दरों का सीधा एकीकरण।',
        traceableQuality: 'विश्वसनीय गुणवत्ता',
        traceableQualityDesc: 'फोटो साक्ष्य और गुणवत्ता घोषणाओं के साथ पारदर्शी उत्पाद स्थिति और निष्पक्ष विवाद समाधान।',
        statsFarmers: 'सत्यापित किसान',
        statsCommodities: 'प्रमुख फसलें',
        statsMandis: 'एपीएमसी मंडियां',
        statsCommission: 'मध्यस्थ शुल्क'
      },
      marketplace: {
        title: 'ताज़ा फसल और उपज खोजें',
        subtitle: 'सत्यापित स्थानीय खेतों और किसान उत्पादक संगठनों (FPO) से सीधे प्राप्त',
        searchPlaceholder: 'ताज़ी उपज, अनाज, फल, सब्ज़ियाँ खोजें…',
        categories: 'श्रेणियां',
        allProduce: 'सभी उपज',
        vegetables: 'सब्ज़ियाँ',
        fruits: 'फल',
        grains: 'अनाज व खाद्यान्न',
        pulses: 'दालें व दलहन',
        spices: 'मसाले',
        filterByState: 'राज्य अनुसार चुनें',
        allStates: 'सभी राज्य',
        addToCart: '+ कार्ट में जोड़ें',
        inStock: 'उपलब्ध',
        outOfStock: 'स्टॉक समाप्त',
        verifiedFarmer: 'सत्यापित किसान ✓',
        viewOnly: 'केवल देखें',
        perKg: 'प्रति किग्रा',
        availableKg: '{count} किग्रा उपलब्ध',
        noProductsFound: 'आपकी खोज के अनुसार कोई उत्पाद नहीं मिला।'
      },
      cart: {
        title: 'शॉपिंग कार्ट',
        empty: 'आपकी कार्ट खाली है',
        emptySubtitle: 'सीधे किसानों से ताज़ा उपज जोड़ने के लिए हमारे मंडी बाज़ार को देखें।',
        orderSummary: 'ऑर्डर सारांश',
        subtotal: 'उपज उप-योग',
        platformFee: 'प्लेटफ़ॉर्म सुविधा शुल्क',
        deliveryCharges: 'डिलीवरी शुल्क',
        totalPayable: 'कुल देय राशि',
        proceedToCheckout: 'चेकआउट के लिए आगे बढ़ें',
        continueShopping: 'खरीदारी जारी रखें',
        remove: 'हटाएं'
      },
      orders: {
        title: 'ऑर्डर और ट्रैकिंग',
        subtitle: 'खेत से डिस्पैच और डिलीवरी तक अपने ऑर्डर की वास्तविक स्थिति ट्रैक करें',
        orderNumber: 'ऑर्डर #{number}',
        orderPlaced: 'ऑर्डर दिया गया',
        farmerConfirmed: 'किसान द्वारा स्वीकृत',
        preparing: 'पैकिंग जारी',
        ready: 'डिलीवरी के लिए तैयार',
        completed: 'सफलतापूर्वक वितरित',
        cancelled: 'रद्द किया गया',
        rejected: 'अस्वीकृत',
        placedOn: 'ऑर्डर तिथि: {date}',
        trackDelivery: 'ऑर्डर ट्रैक करें',
        viewDetails: 'विवरण देखें',
        fileDispute: 'विवाद दर्ज करें',
        noOrders: 'अभी तक कोई ऑर्डर नहीं दिया गया है।'
      },
      price: {
        title: 'लाइव मंडी भाव व बाज़ार विश्लेषण',
        subtitle: 'भारत सरकार के AGMARKNET और data.gov.in से सीधे प्राप्त दैनिक एपीएमसी मंडी दरें',
        selectCommodity: 'फसल / जींस चुनें',
        selectState: 'राज्य चुनें',
        selectDistrict: 'ज़िला चुनें',
        selectMarket: 'एपीएमसी मंडी चुनें',
        arrivalDate: 'आवक तिथि',
        modalPrice: 'मॉडल (औसत) भाव',
        minPrice: 'न्यूनतम भाव',
        maxPrice: 'अधिकतम भाव',
        unitQuintal: '₹/क्विंटल',
        trendAnalysis: 'मूल्य रुझान विश्लेषण',
        compareMandis: 'मंडियों की तुलना करें',
        liveBadge: 'लाइव सरकारी डेटा',
        disclaimer: 'कृषि विपणन सूचना नेटवर्क (AGMARKNET) द्वारा दैनिक रूप से अद्यतन डेटा।'
      },
      sell: {
        title: 'अपनी उपज सूचीबद्ध करें',
        subtitle: 'पारदर्शी मूल्य पर सीधे उपभोक्ताओं और खरीदारों को अपनी फसल बेचें',
        commodityName: 'फसल का नाम',
        category: 'श्रेणी',
        quantity: 'उपलब्ध मात्रा',
        unitPrice: 'प्रति किग्रा मूल्य (₹)',
        grade: 'गुणवत्ता ग्रेड',
        harvestDate: 'कटाई की तिथि',
        location: 'खेत का स्थान',
        description: 'उपज का विवरण',
        uploadPhotos: 'उपज की तस्वीरें / गुणवत्ता प्रमाण अपलोड करें',
        submitListing: 'उपज लिस्ट करें',
        myListings: 'मेरी सक्रिय लिस्टिंग'
      },
      about: {
        title: 'कृषिसेतु के बारे में',
        subtitle: 'भारतीय किसानों और उपभोक्ताओं के बीच सीधा सेतु',
        missionTitle: 'हमारा उद्देश्य',
        missionText: 'कृषिसेतु एक खुला, पारदर्शी डिजिटल कृषि बाज़ार है जो शोषक बिचौलियों को खत्म करने, सत्यापित मंडी दरें प्रदान करने और किसानों व खरीदारों के बीच विश्वसनीय गुणवत्ता स्थापित करने के लिए बनाया गया है।',
        pillarDataTrust: 'डेटा विश्वसनीयता: किसी भी दर में हेरफेर नहीं; पूरी तरह सरकारी AGMARKNET आवक पर आधारित।',
        pillarQualityTrust: 'गुणवत्ता विश्वसनीयता: उत्पाद की वास्तविक तस्वीरों और ग्रेडिंग साक्ष्य के साथ पारदर्शी घोषणा।',
        pillarTransactionTrust: 'लेन-देन विश्वसनीयता: स्पष्ट ऑर्डर ट्रैकिंग और निष्पक्ष विवाद समाधान प्रणाली।'
      },
      auth: {
        signInTitle: 'कृषिसेतु में लॉगिन करें',
        signUpTitle: 'नया खाता बनाएं',
        contactLabel: 'मोबाइल नंबर या ईमेल',
        passwordLabel: 'पासवर्ड',
        nameLabel: 'पूरा नाम',
        roleLabel: 'आपकी भूमिका:',
        roleBuyer: 'ताज़ा उपज खरीदें (उपभोक्ता / खुदरा खरीदार)',
        roleSeller: 'फसल बेचें (किसान / FPO)',
        signInBtn: 'लॉगिन करें',
        signUpBtn: 'खाता बनाएं',
        forgotPassword: 'पासवर्ड भूल गए?',
        or: 'या'
      },
      chat: {
        title: 'कृषिसेतु एआई सहायक',
        subtitle: 'प्रमाणित कृषि एआई सहायक',
        welcomeMessage: 'नमस्ते! मैं आपका कृषिसेतु एआई सहायक हूँ। आज मैं फसलों, मंडी भाव, उत्पाद गुणवत्ता या बाज़ार के ऑर्डरों में आपकी क्या सहायता कर सकता हूँ?',
        inputPlaceholder: 'फसलों, मंडी भाव, गुणवत्ता के बारे में पूछें...',
        send: 'भेजें',
        clear: 'बातचीत साफ़ करें',
        close: 'बंद करें',
        typing: 'सोच रहा है...',
        signInRequired: 'कृषिसेतु सहायक से बातचीत करने के लिए साइन इन करें',
        signInPrompt: 'मंडी भाव, उत्पाद गुणवत्ता और अपने ऑर्डर के बारे में पूछने के लिए अपने खाते में साइन इन करें।',
        promptQuality: 'उत्पाद की गुणवत्ता कैसे जांची जाती है?',
        promptMandi: 'मंडी भाव देखें',
        promptBuy: 'उपज कैसे खरीदें?',
        promptSell: 'फसल कैसे बेचें?',
        errorGeneric: 'क्षमा करें, कोई समस्या आई। कृपया पुनः प्रयास करें।',
        aiUnavailable: 'एआई सहायक सेवा वर्तमान में अनुपलब्ध है। कृपया बाद में पुनः प्रयास करें।'
      },
      voice: {
        startListening: 'आवाज़ से बोलें (माइक शुरू करें)',
        stopListening: 'सुनना बंद करें',
        listening: 'सुन रहा हूँ... अब बोलें',
        processing: 'आवाज़ संसाधित हो रही है...',
        speakResponse: 'उत्तर बोलकर सुनाएं',
        stopSpeaking: 'बोलना बंद करें',
        speaking: 'बोल रहा हूँ...',
        autoSpeechOn: 'ऑटो-वॉइस चालू है',
        autoSpeechOff: 'ऑटो-वॉइस बंद है',
        toggleAutoSpeech: 'ऑटो-वॉइस उत्तर टॉगल करें',
        unsupported: 'इस ब्राउज़र में आवाज़ इनपुट समर्थित नहीं है। कृपया लिखकर पूछें।',
        permissionDenied: 'माइक्रोफ़ोन अनुमति अस्वीकृत हो गई। कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति दें।',
        noSpeech: 'कोई आवाज़ सुनाई नहीं दी। कृपया माइक दबाकर पुनः बोलें।',
        recognitionError: 'आवाज़ पहचान में समस्या आई। कृपया पुनः प्रयास करें या संदेश लिखें।',
        speechUnavailable: 'इस डिवाइस पर वाक् संश्लेषण (स्पीच) समर्थित नहीं है।'
      }
    },
    mr: {
      "common": {
            "search": "शोधा",
            "submit": "जमा करा",
            "cancel": "रद्द करा",
            "save": "जतन करा",
            "edit": "संपादित करा",
            "delete": "हटवा",
            "close": "बंद करा",
            "back": "मागे",
            "next": "पुढे",
            "loading": "लोड होत आहे…",
            "error": "त्रुटी",
            "success": "यशस्वी",
            "confirm": "पुष्टी करा",
            "yes": "होय",
            "no": "नाही",
            "viewAll": "सर्व पहा",
            "details": "तपशील",
            "filter": "फिल्टर",
            "clear": "साफ करा",
            "status": "स्थिती",
            "action": "कृती",
            "all": "सर्व",
            "na": "लागू नाही",
            "kg": "किलो",
            "quintal": "क्विंटल",
            "rupee": "₹"
      },
      "nav": {
            "home": "मुख्यपृष्ठ",
            "dashboard": "डॅशबोर्ड",
            "marketplace": "मंडी बाजार",
            "mandiRates": "मंडी भाव",
            "sellProducts": "शेतमाल विका",
            "orders": "ऑर्डर ट्रॅकिंग",
            "aboutUs": "आमच्याबद्दल",
            "detectLocation": "स्थान ओळखा",
            "viewCart": "कार्ट पहा",
            "notifications": "सूचना व अलर्ट",
            "backgroundAlerts": "पार्श्वभूमी सूचना",
            "enableAlerts": "सूचना सुरू करा",
            "testAlert": "चाचणी (३ सेकंद)",
            "soundOn": "आवाज चालू",
            "soundOff": "आवाज बंद",
            "markAllRead": "सर्व वाचलेले चिन्हांकित करा",
            "quickCheckup": "प्लॅटफॉर्म त्वरित तपासणी",
            "login": "लॉगिन करा",
            "logout": "लॉगआउट",
            "profile": "प्रोफाइल",
            "myDashboard": "माझा डॅशबोर्ड",
            "feedback": "अभिप्राय",
            "selectLanguage": "भाषा / Language"
      },
      "landing": {
            "badge": "थेट शेतातून ग्राहकांपर्यंत पारदर्शक कृषी मंच",
            "heroTitle": "थेट शेतकरी ते खरेदीदार कृषी बाजार",
            "heroSubtitle": "सत्यापित शेतकरी आणि FPO ना थेट ग्राहक आणि किरकोळ खरेदीदारांशी जोडणे — थेट मंडी भाव आणि पारदर्शक गुणवत्ता हमीसह.",
            "browseMarketplace": "मंडी बाजार पहा",
            "startSelling": "शेतमाल विकणे सुरू करा",
            "checkMandiPrices": "मंडी भाव तपासा",
            "zeroMiddlemen": "मध्यस्थांशिवाय थेट व्यापार",
            "zeroMiddlemenDesc": "कोणत्याही अनुचित दलाली किंवा कमिशनशिवाय शेतकऱ्यांना त्यांच्या शेतमालाचे पूर्ण मूल्य थेट मिळते.",
            "fairPricesGuaranteed": "पारदर्शक आणि वाजवी दर",
            "fairPricesGuaranteedDesc": "दैनिक अधिकृत मंडी भाव आणि पारदर्शक गुणवत्ता प्रतवारीवर आधारित प्रामाणिक दर.",
            "mandiBenchmarked": "सरकारी मंडी बेंचमार्क",
            "mandiBenchmarkedDesc": "भारत सरकारच्या AGMARKNET पोर्टलवरून थेट सत्यापित दैनिक बाजार भाव.",
            "traceableQuality": "विश्वसनीय गुणवत्ता",
            "traceableQualityDesc": "फोटो पुरावे आणि गुणवत्ता घोषणांसह पारदर्शक उत्पादन स्थिती आणि निष्पक्ष विवाद निवारण.",
            "statsFarmers": "सत्यापित शेतकरी",
            "statsCommodities": "प्रमुख पिके",
            "statsMandis": "एपीएमसी मंडया",
            "statsCommission": "मध्यस्थ शुल्क"
      },
      "marketplace": {
            "title": "ताजी शेतमाल आवक व पिके",
            "subtitle": "स्थानिक शेतकरी आणि शेतकरी उत्पादक कंपन्यांकडून (FPO) थेट खरेदी करा",
            "searchPlaceholder": "ताजी पिके, धान्य, फळे, भाजीपाला शोधा…",
            "categories": "श्रेण्या",
            "allProduce": "सर्व शेतमाल",
            "vegetables": "भाजीपाला",
            "fruits": "फळे",
            "grains": "धान्य व कडधान्ये",
            "pulses": "डाळी व कडधान्ये",
            "spices": "मसाले",
            "filterByState": "राज्यानुसार निवडा",
            "allStates": "सर्व राज्ये",
            "addToCart": "+ कार्टमध्ये जोडा",
            "inStock": "उपलब्ध",
            "outOfStock": "स्टॉक संपला",
            "verifiedFarmer": "सत्यापित शेतकरी ✓",
            "viewOnly": "फक्त पहा",
            "perKg": "प्रति किलो",
            "availableKg": "{count} किलो उपलब्ध",
            "noProductsFound": "आपल्या निकषानुसार कोणताही शेतमाल आढळला नाही."
      },
      "cart": {
            "title": "शॉपिंग कार्ट",
            "empty": "आपली कार्ट रिकामी आहे",
            "emptySubtitle": "थेट शेतकऱ्यांकडून ताजी उत्पादने जोडण्यासाठी आमची बाजारपेठ पहा.",
            "orderSummary": "ऑर्डर सारांश",
            "subtotal": "शेतमाल उप-एकूण",
            "platformFee": "प्लॅटफॉर्म सुविधा शुल्क",
            "deliveryCharges": "वितरण शुल्क",
            "totalPayable": "एकूण देय रक्कम",
            "proceedToCheckout": "चेकआउट करा",
            "continueShopping": "खरेदी सुरू ठेवा",
            "remove": "काढून टाका"
      },
      "orders": {
            "title": "ऑर्डर्स आणि ट्रॅकिंग",
            "subtitle": "शेतातील पॅकिंगपासून वितरणापर्यंत आपल्या ऑर्डरची थेट स्थिती पहा",
            "orderNumber": "ऑर्डर #{number}",
            "orderPlaced": "ऑर्डर नोंदवली",
            "farmerConfirmed": "शेतकऱ्याने स्वीकारली",
            "preparing": "पॅकिंग सुरू",
            "ready": "वितरणासाठी बाहेर",
            "completed": "यशस्वीरीत्या वितरित",
            "cancelled": "रद्द केली",
            "rejected": "नाकारली",
            "placedOn": "ऑर्डर तारीख: {date}",
            "trackDelivery": "ऑर्डर ट्रॅक करा",
            "viewDetails": "तपशील पहा",
            "fileDispute": "तक्रार नोंदवा",
            "noOrders": "अद्याप कोणतीही ऑर्डर नोंदवलेली नाही."
      },
      "price": {
            "title": "थेट मंडी भाव व बाजार विश्लेषण",
            "subtitle": "भारत सरकारच्या AGMARKNET व data.gov.in कडून अधिकृत दैनिक एपीएमसी दर",
            "selectCommodity": "पीक / शेतमाल निवडा",
            "selectState": "राज्य निवडा",
            "selectDistrict": "जिल्हा निवडा",
            "selectMarket": "एपीएमसी मंडी निवडा",
            "arrivalDate": "आवक तारीख",
            "modalPrice": "सरासरी (मॉडेल) भाव",
            "minPrice": "किमान भाव",
            "maxPrice": "कमाल भाव",
            "unitQuintal": "₹/क्विंटल",
            "trendAnalysis": "दर कल विश्लेषण",
            "compareMandis": "मंडयांची तुलना करा",
            "liveBadge": "थेट सरकारी डेटा",
            "disclaimer": "कृषी विपणन माहिती नेटवर्क (AGMARKNET) द्वारे दररोज अद्यतनित डेटा."
      },
      "sell": {
            "title": "आपला शेतमाल विक्रीसाठी नोंदवा",
            "subtitle": "पारदर्शक दरात थेट ग्राहक आणि खरेदीदारांना आपली पिके विका",
            "commodityName": "पिकाचे नाव",
            "category": "श्रेणी",
            "quantity": "उपलब्ध प्रमाण",
            "unitPrice": "प्रति किलो दर (₹)",
            "grade": "गुणवत्ता प्रत (Grade)",
            "harvestDate": "कापणीची तारीख",
            "location": "शेताचे ठिकाण",
            "description": "शेतमालाचे वर्णन",
            "uploadPhotos": "शेतमालाचे फोटो / गुणवत्ता पुरावा अपलोड करा",
            "submitListing": "शेतमाल लिस्ट करा",
            "myListings": "माझ्या सक्रिय लिस्टिंग"
      },
      "about": {
            "title": "कृषीसेतूबद्दल",
            "subtitle": "भारतीय शेतकरी आणि ग्राहकांमधील थेट सेतू",
            "missionTitle": "आमचे ध्येय",
            "missionText": "कृषीसेतू हा एक खुला, पारदर्शक कृषी मंच आहे जो मध्यस्थांचे उच्चाटन करून, प्रामाणिक मंडी भाव उपलब्ध करून शेतकरी आणि ग्राहकांमध्ये विश्वासाचे नाते निर्माण करतो.",
            "pillarDataTrust": "डेटा विश्वासार्हता: दरांमध्ये कोणतीही खोटी माहिती नाही; १००% अधिकृत AGMARKNET आवक.",
            "pillarQualityTrust": "गुणवत्ता विश्वासार्हता: वास्तविक फोटो आणि प्रतवारी पुराव्यांसह पारदर्शक घोषणा.",
            "pillarTransactionTrust": "व्यवहार विश्वासार्हता: टप्प्याटप्प्याने ऑर्डर ट्रॅकिंग आणि निष्पक्ष तक्रार निवारण."
      },
      "auth": {
            "signInTitle": "कृषीसेतूमध्ये लॉगिन करा",
            "signUpTitle": "नवीन खाते तयार करा",
            "contactLabel": "मोबाईल नंबर किंवा ईमेल",
            "passwordLabel": "पासवर्ड",
            "nameLabel": "पूर्ण नाव",
            "roleLabel": "आपली भूमिका:",
            "roleBuyer": "ताजा शेतमाल खरेदी करा (ग्राहक / किरकोळ व्यापारी)",
            "roleSeller": "शेतमाल विका (शेतकरी / FPO)",
            "signInBtn": "लॉगिन करा",
            "signUpBtn": "खाते तयार करा",
            "forgotPassword": "पासवर्ड विसरलात?",
            "or": "किंवा"
      },
      "chat": {
            "title": "कृषीसेतू एआय सहाय्यक",
            "subtitle": "प्रमाणित कृषी एआय सहाय्यक",
            "welcomeMessage": "नमस्कार! मी आपला कृषीसेतू एआय सहाय्यक आहे. आज मी पिके, मंडी भाव, प्रतवारी किंवा बाजारपेठेतील ऑर्डर्समध्ये आपली काय मदत करू शकतो?",
            "inputPlaceholder": "पिके, मंडी भाव, गुणवत्तेबद्दल विचारा...",
            "send": "पाठवा",
            "clear": "संभाषण साफ करा",
            "close": "बंद करा",
            "typing": "विचार करत आहे...",
            "signInRequired": "कृषीसेतू सहाय्यकाशी बोलण्यासाठी कृपया लॉगिन करा",
            "signInPrompt": "मंडी भाव, शेतमाल गुणवत्ता आणि आपल्या ऑर्डर्सबद्दल विचारण्यासाठी खात्यात लॉगिन करा.",
            "promptQuality": "उत्पादनाची गुणवत्ता कशी तपासली जाते?",
            "promptMandi": "मंडी भाव पहा",
            "promptBuy": "शेतमाल कसा खरेदी करावा?",
            "promptSell": "शेतमाल विक्रीसाठी कसा नोंदवावा?",
            "errorGeneric": "क्षमस्व, काही समस्या आली. कृपया पुन्हा प्रयत्न करा.",
            "aiUnavailable": "एआय सहाय्यक सेवा सध्या अनुपलब्ध आहे. कृपया नंतर प्रयत्न करा."
      },
      "voice": {
            "startListening": "आवाजाने बोला (माइक सुरू करा)",
            "stopListening": "ऐकणे थांबवा",
            "listening": "ऐकत आहे... आता बोला",
            "processing": "आवाज प्रक्रिया सुरू आहे...",
            "speakResponse": "उत्तर बोलून ऐका",
            "stopSpeaking": "बोलणे थांबवा",
            "speaking": "बोलत आहे...",
            "autoSpeechOn": "ऑटो-व्हॉइस चालू आहे",
            "autoSpeechOff": "ऑटो-व्हॉइस बंद आहे",
            "toggleAutoSpeech": "ऑटो-व्हॉइस उत्तर टॉगल करा",
            "unsupported": "या ब्राउझरमध्ये आवाज इनपुट समर्थित नाही. कृपया टाईप करून विचारा.",
            "permissionDenied": "मायक्रोफोन परवानगी नाकारली गेली. कृपया ब्राउझर सेटिंग्जमध्ये परवानगी द्या.",
            "noSpeech": "कोणताही आवाज ऐकू आला नाही. कृपया माइक दाबून पुन्हा बोला.",
            "recognitionError": "आवाज ओळखण्यात समस्या आली. कृपया पुन्हा प्रयत्न करा किंवा टाईप करा.",
            "speechUnavailable": "या डिव्हाइसवर स्पीच सिंथेसिस उपलब्ध नाही."
      }
},
    pa: {
      "common": {
            "search": "ਖੋਜੋ",
            "submit": "ਜਮ੍ਹਾਂ ਕਰੋ",
            "cancel": "ਰੱਦ ਕਰੋ",
            "save": "ਸੰਭਾਲੋ",
            "edit": "ਸੋਧੋ",
            "delete": "ਮਿਟਾਓ",
            "close": "ਬੰਦ ਕਰੋ",
            "back": "ਪਿੱਛੇ",
            "next": "ਅੱਗੇ",
            "loading": "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…",
            "error": "ਗਲਤੀ",
            "success": "ਸਫਲ",
            "confirm": "ਪੁਸ਼ਟੀ ਕਰੋ",
            "yes": "ਹਾਂ",
            "no": "ਨਹੀਂ",
            "viewAll": "ਸਾਰੇ ਦੇਖੋ",
            "details": "ਵੇਰਵੇ",
            "filter": "ਫਿਲਟਰ",
            "clear": "ਸਾਫ਼ ਕਰੋ",
            "status": "ਸਥਿਤੀ",
            "action": "ਕਾਰਵਾਈ",
            "all": "ਸਾਰੇ",
            "na": "ਲਾਗੂ ਨਹੀਂ",
            "kg": "ਕਿਲੋ",
            "quintal": "ਕੁਇੰਟਲ",
            "rupee": "₹"
      },
      "nav": {
            "home": "ਮੁੱਖ ਪੰਨਾ",
            "dashboard": "ਡੈਸ਼ਬੋਰਡ",
            "marketplace": "ਮੰਡੀ ਬਾਜ਼ਾਰ",
            "mandiRates": "ਮੰਡੀ ਭਾਅ",
            "sellProducts": "ਉਪਜ ਵੇਚੋ",
            "orders": "ਆਰਡਰ ਟਰੈਕਿੰਗ",
            "aboutUs": "ਸਾਡੇ ਬਾਰੇ",
            "detectLocation": "ਸਥਾਨ ਪਛਾਣੋ",
            "viewCart": "ਕਾਰਟ ਦੇਖੋ",
            "notifications": "ਸੂਚਨਾਵਾਂ",
            "backgroundAlerts": "ਬੈਕਗ੍ਰਾਊਂਡ ਚੇਤਾਵਨੀਆਂ",
            "enableAlerts": "ਚੇਤਾਵਨੀਆਂ ਚਾਲੂ ਕਰੋ",
            "testAlert": "ਟੈਸਟ (3 ਸਕਿੰਟ)",
            "soundOn": "ਆਵਾਜ਼ ਚਾਲੂ",
            "soundOff": "ਆਵਾਜ਼ ਬੰਦ",
            "markAllRead": "ਸਾਰੇ ਪੜ੍ਹੇ ਮਾਰਕ ਕਰੋ",
            "quickCheckup": "ਪਲੇਟਫਾਰਮ ਜਾਂਚ",
            "login": "ਲਾਗਇਨ",
            "logout": "ਲਾਗਆਉਟ",
            "profile": "ਪ੍ਰੋਫਾਈਲ",
            "myDashboard": "ਮੇਰਾ ਡੈਸ਼ਬੋਰਡ",
            "feedback": "ਫੀਡਬੈਕ",
            "selectLanguage": "ਭਾਸ਼ਾ / Language"
      },
      "landing": {
            "badge": "ਸਿੱਧਾ ਖੇਤ ਤੋਂ ਖਪਤਕਾਰ ਖੇਤੀਬਾੜੀ ਪਲੇਟਫਾਰਮ",
            "heroTitle": "ਸਿੱਧਾ ਕਿਸਾਨ ਤੋਂ ਖਰੀਦਦਾਰ ਬਾਜ਼ਾਰ",
            "heroSubtitle": "ਪ੍ਰਮਾਣਿਤ ਕਿਸਾਨਾਂ ਅਤੇ ਐਫਪੀਓਜ਼ ਨੂੰ ਸਿੱਧੇ ਗਾਹਕਾਂ ਨਾਲ ਜੋੜਨ ਵਾਲਾ ਮੰਚ — ਲਾਈਵ ਮੰਡੀ ਭਾਅ ਅਤੇ ਪਾਰਦਰਸ਼ੀ ਗੁਣਵੱਤਾ ਦੇ ਨਾਲ।",
            "browseMarketplace": "ਮੰਡੀ ਬਾਜ਼ਾਰ ਦੇਖੋ",
            "startSelling": "ਫਸਲ ਵੇਚਣੀ ਸ਼ੁਰੂ ਕਰੋ",
            "checkMandiPrices": "ਮੰਡੀ ਭਾਅ ਦੇਖੋ",
            "zeroMiddlemen": "ਜ਼ੀਰੋ ਵਿਚੋਲੇ",
            "zeroMiddlemenDesc": "ਕਿਸੇ ਵੀ ਕਮਿਸ਼ਨ ਤੋਂ ਬਿਨਾਂ ਕਿਸਾਨਾਂ ਨੂੰ ਉਨ੍ਹਾਂ ਦੀ ਉਪਜ ਦਾ ਪੂਰਾ ਮੁੱਲ ਸਿੱਧਾ ਮਿਲਦਾ ਹੈ।",
            "fairPricesGuaranteed": "ਵਾਜਬ ਭਾਅ ਦੀ ਗਾਰੰਟੀ",
            "fairPricesGuaranteedDesc": "ਸਰਕਾਰੀ ਏਪੀਐਮਸੀ ਆਮਦ ਅਤੇ ਪਾਰਦਰਸ਼ੀ ਗ੍ਰੇਡਿੰਗ ਅਧਾਰਿਤ ਭਾਅ।",
            "mandiBenchmarked": "ਸਰਕਾਰੀ ਮੰਡੀ ਅਧਾਰਿਤ",
            "mandiBenchmarkedDesc": "AGMARKNET ਸਰਕਾਰੀ ਮੰਡੀ ਡਾਟਾ ਸਿੱਧਾ ਉਪਲਬਧ।",
            "traceableQuality": "ਪਾਰਦਰਸ਼ੀ ਗੁਣਵੱਤਾ",
            "traceableQualityDesc": "ਕਿਸਾਨ ਦੁਆਰਾ ਘੋਸ਼ਿਤ ਗ੍ਰੇਡ ਅਤੇ ਫੋਟੋ ਸਬੂਤਾਂ ਨਾਲ ਪਾਰਦਰਸ਼ੀ ਹੱਲ।",
            "statsFarmers": "ਪ੍ਰਮਾਣਿਤ ਕਿਸਾਨ",
            "statsCommodities": "ਮੁੱਖ ਫਸਲਾਂ",
            "statsMandis": "ਏਪੀਐਮਸੀ ਮੰਡੀਆਂ",
            "statsCommission": "ਵਿਚੋਲਾ ਫੀਸ"
      },
      "marketplace": {
            "title": "ਤਾਜ਼ੀ ਫਸਲ ਤੇ ਖੇਤੀ ਉਪਜ",
            "subtitle": "ਸਥਾਨਕ ਕਿਸਾਨਾਂ ਅਤੇ ਕਿਸਾਨ ਉਤਪਾਦਕ ਸੰਗਠਨਾਂ (FPO) ਤੋਂ ਸਿੱਧੀ ਖਰੀਦ ਕਰੋ",
            "searchPlaceholder": "ਤਾਜ਼ੀਆਂ ਫਸਲਾਂ, ਸਬਜ਼ੀਆਂ, ਅਨਾਜ ਜਾਂ ਫਲ ਖੋਜੋ…",
            "categories": "ਸ਼੍ਰੇਣੀਆਂ",
            "allProduce": "ਸਾਰੀ ਉਪਜ",
            "vegetables": "ਸਬਜ਼ੀਆਂ",
            "fruits": "ਫਲ",
            "grains": "ਅਨਾਜ ਅਤੇ ਦਾਲਾਂ",
            "pulses": "ਦਾਲਾਂ",
            "spices": "ਮਸਾਲੇ",
            "filterByState": "ਸੂਬੇ ਅਨੁਸਾਰ ਚੁਣੋ",
            "allStates": "ਸਾਰੇ ਸੂਬੇ",
            "addToCart": "+ ਕਾਰਟ ਵਿੱਚ ਜੋੜੋ",
            "inStock": "ਉਪਲਬਧ",
            "outOfStock": "ਸਟਾਕ ਮੁੱਕ ਗਿਆ",
            "verifiedFarmer": "ਪ੍ਰਮਾਣਿਤ ਕਿਸਾਨ ✓",
            "viewOnly": "ਸਿਰਫ਼ ਦੇਖੋ",
            "perKg": "ਪ੍ਰਤੀ ਕਿਲੋ",
            "availableKg": "{count} ਕਿਲੋ ਉਪਲਬਧ",
            "noProductsFound": "ਤੁਹਾਡੀ ਖੋਜ ਮੁਤਾਬਕ ਕੋਈ ਉਤਪਾਦ ਨਹੀਂ ਮਿਲਿਆ।"
      },
      "cart": {
            "title": "ਸ਼ਾਪਿੰਗ ਕਾਰਟ",
            "empty": "ਤੁਹਾਡਾ ਕਾਰਟ ਖਾਲੀ ਹੈ",
            "emptySubtitle": "ਕਿਸਾਨਾਂ ਤੋਂ ਸਿੱਧੀ ਤਾਜ਼ੀ ਉਪਜ ਖਰੀਦਣ ਲਈ ਸਾਡਾ ਮੰਡੀ ਬਾਜ਼ਾਰ ਦੇਖੋ।",
            "orderSummary": "ਆਰਡਰ ਸਾਰਾਂਸ਼",
            "subtotal": "ਉਪਜ ਕੁੱਲ ਜੋੜ",
            "platformFee": "ਪਲੇਟਫਾਰਮ ਸੁਵਿਧਾ ਫੀਸ",
            "deliveryCharges": "ਡਿਲੀਵਰੀ ਖਰਚਾ",
            "totalPayable": "ਕੁੱਲ ਦੇਣ ਯੋਗ ਰਕਮ",
            "proceedToCheckout": "ਚੈੱਕਆਉਟ ਲਈ ਅੱਗੇ ਵਧੋ",
            "continueShopping": "ਖਰੀਦਦਾਰੀ ਜਾਰੀ ਰੱਖੋ",
            "remove": "ਹਟਾਓ"
      },
      "orders": {
            "title": "ਆਰਡਰ ਅਤੇ ਟਰੈਕਿੰਗ",
            "subtitle": "ਖੇਤ ਤੋਂ ਪੈਕਿੰਗ ਅਤੇ ਡਿਲੀਵਰੀ ਤੱਕ ਆਪਣੇ ਆਰਡਰ ਦੀ ਅਸਲ ਸਥਿਤੀ ਦੇਖੋ",
            "orderNumber": "ਆਰਡਰ #{number}",
            "orderPlaced": "ਆਰਡਰ ਦਿੱਤਾ ਗਿਆ",
            "farmerConfirmed": "ਕਿਸਾਨ ਦੁਆਰਾ ਸਵੀਕਾਰਿਆ",
            "preparing": "ਪੈਕਿੰਗ ਜਾਰੀ",
            "ready": "ਡਿਲੀਵਰੀ ਲਈ ਤਿਆਰ",
            "completed": "ਸਫਲਤਾਪੂਰਵਕ ਡਿਲੀਵਰ",
            "cancelled": "ਰੱਦ ਕੀਤਾ ਗਿਆ",
            "rejected": "ਅਸਵੀਕਾਰਿਆ",
            "placedOn": "ਆਰਡਰ ਮਿਤੀ: {date}",
            "trackDelivery": "ਆਰਡਰ ਟਰੈਕ ਕਰੋ",
            "viewDetails": "ਵੇਰਵੇ ਦੇਖੋ",
            "fileDispute": "ਵਿਵਾਦ ਦਰਜ ਕਰੋ",
            "noOrders": "ਅਜੇ ਤੱਕ ਕੋਈ ਆਰਡਰ ਨਹੀਂ ਦਿੱਤਾ ਗਿਆ।"
      },
      "price": {
            "title": "ਲਾਈਵ ਮੰਡੀ ਭਾਅ ਅਤੇ ਵਿਸ਼ਲੇਸ਼ਣ",
            "subtitle": "ਭਾਰਤ ਸਰਕਾਰ ਦੇ AGMARKNET ਅਤੇ data.gov.in ਤੋਂ ਸਿੱਧੇ ਰੋਜ਼ਾਨਾ ਏਪੀਐਮਸੀ ਭਾਅ",
            "selectCommodity": "ਫਸਲ / ਉਪਜ ਚੁਣੋ",
            "selectState": "ਸੂਬਾ ਚੁਣੋ",
            "selectDistrict": "ਜ਼ਿਲ੍ਹਾ ਚੁਣੋ",
            "selectMarket": "ਏਪੀਐਮਸੀ ਮੰਡੀ ਚੁਣੋ",
            "arrivalDate": "ਆਮਦ ਮਿਤੀ",
            "modalPrice": "ਔਸਤ (ਮਾਡਲ) ਭਾਅ",
            "minPrice": "ਘੱਟੋ-ਘੱਟ ਭਾਅ",
            "maxPrice": "ਵੱਧ ਤੋਂ ਵੱਧ ਭਾਅ",
            "unitQuintal": "₹/ਕੁਇੰਟਲ",
            "trendAnalysis": "ਕੀਮਤ ਰੁਝਾਨ ਵਿਸ਼ਲੇਸ਼ਣ",
            "compareMandis": "ਮੰਡੀਆਂ ਦੀ ਤੁਲਨਾ ਕਰੋ",
            "liveBadge": "ਲਾਈਵ ਸਰਕਾਰੀ ਡਾਟਾ",
            "disclaimer": "ਖੇਤੀਬਾੜੀ ਮਾਰਕੀਟਿੰਗ ਸੂਚਨਾ ਨੈੱਟਵਰਕ (AGMARKNET) ਦੁਆਰਾ ਰੋਜ਼ਾਨਾ ਅਪਡੇਟ ਕੀਤਾ ਡਾਟਾ।"
      },
      "sell": {
            "title": "ਆਪਣੀ ਫਸਲ ਸੂਚੀਬੱਧ ਕਰੋ",
            "subtitle": "ਪਾਰਦਰਸ਼ੀ ਕੀਮਤਾਂ ਤੇ ਸਿੱਧੇ ਖਰੀਦਦਾਰਾਂ ਨੂੰ ਆਪਣੀ ਉਪਜ ਵੇਚੋ",
            "commodityName": "ਫਸਲ ਦਾ ਨਾਮ",
            "category": "ਸ਼੍ਰੇਣੀ",
            "quantity": "ਉਪਲਬਧ ਮਾਤਰਾ",
            "unitPrice": "ਪ੍ਰਤੀ ਕਿਲੋ ਮੁੱਲ (₹)",
            "grade": "ਗੁਣਵੱਤਾ ਗ੍ਰੇਡ (Grade)",
            "harvestDate": "ਕਟਾਈ ਦੀ ਮਿਤੀ",
            "location": "ਖੇਤ ਦਾ ਸਥਾਨ",
            "description": "ਉਪਜ ਦਾ ਵੇਰਵਾ",
            "uploadPhotos": "ਫਸਲ ਦੀਆਂ ਫੋਟੋਆਂ / ਗੁਣਵੱਤਾ ਸਬੂਤ ਅਪਲੋਡ ਕਰੋ",
            "submitListing": "ਉਪਜ ਦਰਜ ਕਰੋ",
            "myListings": "ਮੇਰੀਆਂ ਸਰਗਰਮ ਸੂਚੀਆਂ"
      },
      "about": {
            "title": "ਕ੍ਰਿਸ਼ੀਸੇਤੂ ਬਾਰੇ",
            "subtitle": "ਭਾਰਤੀ ਕਿਸਾਨਾਂ ਅਤੇ ਖਪਤਕਾਰਾਂ ਵਿਚਕਾਰ ਸਿੱਧਾ ਪੁਲ",
            "missionTitle": "ਸਾਡਾ ਉਦੇਸ਼",
            "missionText": "ਕ੍ਰਿਸ਼ੀਸੇਤੂ ਇੱਕ ਖੁੱਲ੍ਹਾ, ਪਾਰਦਰਸ਼ੀ ਖੇਤੀਬਾੜੀ ਮੰਚ ਹੈ ਜੋ ਵਿਚੋਲਿਆਂ ਨੂੰ ਖਤਮ ਕਰਕੇ ਕਿਸਾਨਾਂ ਅਤੇ ਖਰੀਦਦਾਰਾਂ ਵਿਚਕਾਰ ਭਰੋਸੇਯੋਗ ਗੁਣਵੱਤਾ ਅਤੇ ਸਹੀ ਭਾਅ ਸਥਾਪਿਤ ਕਰਦਾ ਹੈ।",
            "pillarDataTrust": "ਡਾਟਾ ਭਰੋਸੇਯੋਗਤਾ: ਕੀਮਤਾਂ ਵਿੱਚ ਕੋਈ ਗੜਬੜ ਨਹੀਂ; 100% ਪ੍ਰਮਾਣਿਤ AGMARKNET ਡਾਟਾ।",
            "pillarQualityTrust": "ਗੁਣਵੱਤਾ ਭਰੋਸੇਯੋਗਤਾ: ਅਸਲ ਫੋਟੋਆਂ ਅਤੇ ਗ੍ਰੇਡਿੰਗ ਸਬੂਤਾਂ ਨਾਲ ਪਾਰਦਰਸ਼ੀ ਜਾਣਕਾਰੀ।",
            "pillarTransactionTrust": "ਲੈਣ-ਦੇਣ ਭਰੋਸੇਯੋਗਤਾ: ਕਦਮ-ਦਰ-ਕਦਮ ਆਰਡਰ ਟਰੈਕਿੰਗ ਅਤੇ ਨਿਰਪੱਖ ਵਿਵਾਦ ਹੱਲ।"
      },
      "auth": {
            "signInTitle": "ਕ੍ਰਿਸ਼ੀਸੇਤੂ ਵਿੱਚ ਲਾਗਇਨ ਕਰੋ",
            "signUpTitle": "ਨਵਾਂ ਖਾਤਾ ਬਣਾਓ",
            "contactLabel": "ਮੋਬਾਈਲ ਨੰਬਰ ਜਾਂ ਈਮੇਲ",
            "passwordLabel": "ਪਾਸਵਰਡ",
            "nameLabel": "ਪੂਰਾ ਨਾਮ",
            "roleLabel": "ਤੁਹਾਡੀ ਭੂਮਿਕਾ:",
            "roleBuyer": "ਤਾਜ਼ੀ ਉਪਜ ਖਰੀਦੋ (ਗਾਹਕ / ਪ੍ਰਚੂਨ ਵਿਕਰੇਤਾ)",
            "roleSeller": "ਫਸਲ ਵੇਚੋ (ਕਿਸਾਨ / FPO)",
            "signInBtn": "ਲਾਗਇਨ",
            "signUpBtn": "ਖਾਤਾ ਬਣਾਓ",
            "forgotPassword": "ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ?",
            "or": "ਜਾਂ"
      },
      "chat": {
            "title": "ਕ੍ਰਿਸ਼ੀਸੇਤੂ ਏਆਈ ਸਹਾਇਕ",
            "subtitle": "ਪ੍ਰਮਾਣਿਤ ਖੇਤੀਬਾੜੀ ਏਆਈ ਸਹਾਇਕ",
            "welcomeMessage": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਕ੍ਰਿਸ਼ੀਸੇਤੂ ਏਆਈ ਸਹਾਇਕ ਹਾਂ। ਅੱਜ ਮੈਂ ਫਸਲਾਂ, ਮੰਡੀ ਭਾਅ, ਉਤਪਾਦ ਗੁਣਵੱਤਾ ਜਾਂ ਆਰਡਰਾਂ ਵਿੱਚ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
            "inputPlaceholder": "ਫਸਲਾਂ, ਮੰਡੀ ਭਾਅ, ਗੁਣਵੱਤਾ ਬਾਰੇ ਪੁੱਛੋ...",
            "send": "ਭੇਜੋ",
            "clear": "ਗੱਲਬਾਤ ਸਾਫ਼ ਕਰੋ",
            "close": "ਬੰਦ ਕਰੋ",
            "typing": "ਸੋਚ ਰਿਹਾ ਹੈ...",
            "signInRequired": "ਕ੍ਰਿਸ਼ੀਸੇਤੂ ਸਹਾਇਕ ਨਾਲ ਗੱਲਬਾਤ ਕਰਨ ਲਈ ਲਾਗਇਨ ਕਰੋ",
            "signInPrompt": "ਮੰਡੀ ਭਾਅ, ਗੁਣਵੱਤਾ ਅਤੇ ਆਰਡਰਾਂ ਬਾਰੇ ਪੁੱਛਣ ਲਈ ਖਾਤੇ ਵਿੱਚ ਲਾਗਇਨ ਕਰੋ।",
            "promptQuality": "ਉਤਪਾਦ ਦੀ ਗੁਣਵੱਤਾ ਕਿਵੇਂ ਜਾਂਚੀ ਜਾਂਦੀ ਹੈ?",
            "promptMandi": "ਮੰਡੀ ਭਾਅ ਦੇਖੋ",
            "promptBuy": "ਫਸਲ ਕਿਵੇਂ ਖਰੀਦੀਏ?",
            "promptSell": "ਫਸਲ ਵੇਚਣ ਲਈ ਕਿਵੇਂ ਦਰਜ ਕਰੀਏ?",
            "errorGeneric": "ਮਾਫ਼ ਕਰਨਾ, ਕੋਈ ਸਮੱਸਿਆ ਆਈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
            "aiUnavailable": "ਏਆਈ ਸਹਾਇਕ ਸੇਵਾ ਇਸ ਵੇਲੇ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।"
      },
      "voice": {
            "startListening": "ਆਵਾਜ਼ ਨਾਲ ਬੋਲੋ (ਮਾਈਕ ਸ਼ੁਰੂ ਕਰੋ)",
            "stopListening": "ਸੁਣਨਾ ਬੰਦ ਕਰੋ",
            "listening": "ਸੁਣ ਰਿਹਾ ਹਾਂ... ਹੁਣ ਬੋਲੋ",
            "processing": "ਆਵਾਜ਼ ਪ੍ਰੋਸੈਸ ਹੋ ਰਹੀ ਹੈ...",
            "speakResponse": "ਜਵਾਬ ਬੋਲ ਕੇ ਸੁਣੋ",
            "stopSpeaking": "ਬੋਲਣਾ ਬੰਦ ਕਰੋ",
            "speaking": "ਬੋਲ ਰਿਹਾ ਹਾਂ...",
            "autoSpeechOn": "ਆਟੋ-ਵਾਇਸ ਚਾਲੂ ਹੈ",
            "autoSpeechOff": "ਆਟੋ-ਵਾਇਸ ਬੰਦ ਹੈ",
            "toggleAutoSpeech": "ਆਟੋ-ਵਾਇਸ ਜਵਾਬ ਟੌਗਲ ਕਰੋ",
            "unsupported": "ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਆਵਾਜ਼ ਇਨਪੁਟ ਸਮਰਥਿਤ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਲਿਖ ਕੇ ਪੁੱਛੋ।",
            "permissionDenied": "ਮਾਈਕ੍ਰੋਫੋਨ ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਦਿੱਤੀ ਗਈ। ਕਿਰਪਾ ਕਰਕੇ ਬ੍ਰਾਊਜ਼ਰ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਇਜਾਜ਼ਤ ਦਿਓ।",
            "noSpeech": "ਕੋਈ ਆਵਾਜ਼ ਸੁਣਾਈ ਨਹੀਂ ਦਿੱਤੀ। ਕਿਰਪਾ ਕਰਕੇ ਮਾਈਕ ਦਬਾ ਕੇ ਦੁਬਾਰਾ ਬੋਲੋ।",
            "recognitionError": "ਆਵਾਜ਼ ਪਛਾਣਨ ਵਿੱਚ ਸਮੱਸਿਆ ਆਈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
            "speechUnavailable": "ਇਸ ਡਿਵਾਈਸ ਤੇ ਸਪੀਚ ਸਿੰਥੇਸਿਸ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।"
      }
},
    te: {
      "common": {
            "search": "శోధించండి",
            "submit": "సమర్పించండి",
            "cancel": "రద్దు చేయండి",
            "save": "భద్రపరచండి",
            "edit": "సవరించండి",
            "delete": "తొలగించండి",
            "close": "మూసివేయండి",
            "back": "వెనుకకు",
            "next": "తరువాత",
            "loading": "లోడ్ అవుతోంది…",
            "error": "లోపం",
            "success": "విజయవంతం",
            "confirm": "నిర్ధారించండి",
            "yes": "అవును",
            "no": "కాదు",
            "viewAll": "అన్నీ చూడండి",
            "details": "వివరాలు",
            "filter": "ఫిల్టర్",
            "clear": "క్లియర్ చేయండి",
            "status": "స్థితి",
            "action": "చర్య",
            "all": "అన్నీ",
            "na": "వర్తించదు",
            "kg": "కిలో",
            "quintal": "క్వింటాల్",
            "rupee": "₹"
      },
      "nav": {
            "home": "హోమ్",
            "dashboard": "డాష్‌బోర్డ్",
            "marketplace": "మండీ మార్కెట్",
            "mandiRates": "మండీ ధరలు",
            "sellProducts": "పంటను అమ్మండి",
            "orders": "ఆర్డర్ల ట్రాకింగ్",
            "aboutUs": "మా గురించి",
            "detectLocation": "స్థానాన్ని గుర్తించండి",
            "viewCart": "కార్ట్ చూడండి",
            "notifications": "హెచ్చరికలు",
            "backgroundAlerts": "నేపథ్య హెచ్చరికలు",
            "enableAlerts": "హెచ్చరికలను ప్రారంభించండి",
            "testAlert": "పరీక్ష (3 సెకన్లు)",
            "soundOn": "ధ్వని ఆన్",
            "soundOff": "ధ్వని ఆఫ్",
            "markAllRead": "అన్నీ చదివినట్లు గుర్తించండి",
            "quickCheckup": "ప్లాట్‌ఫామ్ తనిఖీ",
            "login": "లాగిన్",
            "logout": "లాగౌట్",
            "profile": "ప్రొఫైల్",
            "myDashboard": "నా డాష్‌బోర్డ్",
            "feedback": "అభిప్రాయం",
            "selectLanguage": "భాష / Language"
      },
      "landing": {
            "badge": "రైతు నుండి నేరుగా వినియోగదారుడికి వ్యవసాయ వేదిక",
            "heroTitle": "రైతు నుండి నేరుగా కొనుగోలుదారుల మార్కెట్",
            "heroSubtitle": "ధృవీకరించబడిన రైతులు మరియు ఎఫ్‌పిఓలను నేరుగా కొనుగోలుదారులతో అనుసంధానించే వేదిక — ప్రత్యక్ష మండీ ధరలు మరియు పారదర్శక నాణ్యతతో.",
            "browseMarketplace": "మండీ మార్కెట్‌ను చూడండి",
            "startSelling": "పంట అమ్మకం ప్రారంభించండి",
            "checkMandiPrices": "మండీ ధరలను తనిఖీ చేయండి",
            "zeroMiddlemen": "మధ్యవర్తులు లేరు",
            "zeroMiddlemenDesc": "ఎటువంటి కమీషన్ లేకుండా రైతులు తమ పంటకు పూర్తి విలువను నేరుగా పొందుతారు.",
            "fairPricesGuaranteed": "సరసమైన ధరల హామీ",
            "fairPricesGuaranteedDesc": "ప్రభుత్వ ఏపీఎంసీ మార్కెట్ రాకల ఆధారంగా నిర్ణయించబడిన ప్రామాణిక ధరలు.",
            "mandiBenchmarked": "ప్రభుత్వ మండీ ప్రామాణికం",
            "mandiBenchmarkedDesc": "AGMARKNET ప్రభుత్వ మండీ డేటా నేరుగా అందుబాటులో ఉంది.",
            "traceableQuality": "పారదర్శక నాణ్యత",
            "traceableQualityDesc": "రైతు ప్రకటించిన గ్రేడ్ మరియు ఫోటో ఆధారాలతో పారదర్శక పరిష్కారం.",
            "statsFarmers": "ధృవీకరించబడిన రైతులు",
            "statsCommodities": "ప్రధాన పంటలు",
            "statsMandis": "ఏపీఎంసీ మండీలు",
            "statsCommission": "మధ్యవర్తి రుసుము"
      },
      "marketplace": {
            "title": "తాజా పంటల మార్కెట్",
            "subtitle": "స్థానిక రైతులు మరియు ఎఫ్‌పిఓల నుండి నేరుగా తాజా వ్యవసాయ ఉత్పత్తులను కొనుగోలు చేయండి",
            "searchPlaceholder": "పంటలు, ధాన్యాలు, కూరగాయలు లేదా పండ్లను శోధించండి…",
            "categories": "వర్గాలు",
            "allProduce": "అన్ని పంటలు",
            "vegetables": "కూరగాయలు",
            "fruits": "పండ్లు",
            "grains": "ధాన్యాలు & తృణధాన్యాలు",
            "pulses": "పప్పుధాన్యాలు",
            "spices": "మసాలాలు",
            "filterByState": "రాష్ట్రం వారీగా ఎంచుకోండి",
            "allStates": "అన్ని రాష్ట్రాలు",
            "addToCart": "+ కార్ట్‌కు జోడించండి",
            "inStock": "అందుబాటులో ఉంది",
            "outOfStock": "స్టాక్ అయిపోయింది",
            "verifiedFarmer": "ధృవీకరించబడిన రైతు ✓",
            "viewOnly": "చూడటానికి మాత్రమే",
            "perKg": "ప్రతి కిలోకు",
            "availableKg": "{count} కిలోలు అందుబాటులో ఉంది",
            "noProductsFound": "మీ శోధనకు సరిపోలే ఉత్పత్తులేవీ కనుగొనబడలేదు."
      },
      "cart": {
            "title": "షాపింగ్ కార్ట్",
            "empty": "మీ కార్ట్ ఖాళీగా ఉంది",
            "emptySubtitle": "రైతుల నుండి నేరుగా తాజా పంటలను కొనుగోలు చేయడానికి మా మార్కెట్‌ను చూడండి.",
            "orderSummary": "ఆర్డర్ సారాంశం",
            "subtotal": "పంటల ఉపమొత్తం",
            "platformFee": "ప్లాట్‌ఫామ్ రుసుము",
            "deliveryCharges": "డెలివరీ ఛార్జీలు",
            "totalPayable": "మొత్తం చెల్లించవలసినది",
            "proceedToCheckout": "చెక్‌అవుట్‌కు వెళ్లండి",
            "continueShopping": "షాపింగ్ కొనసాగించండి",
            "remove": "తొలగించండి"
      },
      "orders": {
            "title": "ఆర్డర్లు మరియు ట్రాకింగ్",
            "subtitle": "ప్యాకింగ్ నుండి డెలివరీ వరకు మీ ఆర్డర్ ప్రత్యక్ష స్థితిని ట్రాక్ చేయండి",
            "orderNumber": "ఆర్డర్ #{number}",
            "orderPlaced": "ఆర్డర్ ఇవ్వబడింది",
            "farmerConfirmed": "రైతు ఆమోదించారు",
            "preparing": "ప్యాకింగ్ జరుగుతోంది",
            "ready": "డెలివరీకి సిద్ధంగా ఉంది",
            "completed": "విజయవంతంగా డెలివరీ చేయబడింది",
            "cancelled": "రద్దు చేయబడింది",
            "rejected": "తిరస్కరించబడింది",
            "placedOn": "ఆర్డర్ తేదీ: {date}",
            "trackDelivery": "ఆర్డర్ ట్రాక్ చేయండి",
            "viewDetails": "వివరాలు చూడండి",
            "fileDispute": "వివాదాన్ని నివేదించండి",
            "noOrders": "ఇంకా ఎలాంటి ఆర్డర్లు ఇవ్వలేదు."
      },
      "price": {
            "title": "ప్రత్యక్ష మండీ ధరలు & విశ్లేషణ",
            "subtitle": "భారత ప్రభుత్వ AGMARKNET మరియు data.gov.in నుండి నేరుగా రోజువారీ ఏపీఎంసీ ధరలు",
            "selectCommodity": "పంటను ఎంచుకోండి",
            "selectState": "రాష్ట్రాన్ని ఎంచుకోండి",
            "selectDistrict": "జిల్లాను ఎంచుకోండి",
            "selectMarket": "ఏపీఎంసీ మండీని ఎంచుకోండి",
            "arrivalDate": "రాక తేదీ",
            "modalPrice": "సగటు (మోడల్) ధర",
            "minPrice": "కనిష్ట ధర",
            "maxPrice": "గరిష్ట ధర",
            "unitQuintal": "₹/క్వింటాల్",
            "trendAnalysis": "ధరల ట్రెండ్ విశ్లేషణ",
            "compareMandis": "మండీలను సరిపోల్చండి",
            "liveBadge": "లైవ్ ప్రభుత్వ డేటా",
            "disclaimer": "వ్యవసాయ మార్కెటింగ్ సమాచార నెట్‌వర్క్ (AGMARKNET) ద్వారా రోజువారీగా నవీకరించబడిన డేటా."
      },
      "sell": {
            "title": "మీ పంటను అమ్మకానికి నమోదు చేయండి",
            "subtitle": "పారదర్శక ధరలకు నేరుగా కొనుగోలుదారులకు మీ పంటను అమ్మండి",
            "commodityName": "పంట పేరు",
            "category": "వర్గం",
            "quantity": "అందుబాటులో ఉన్న పరిమాణం",
            "unitPrice": "కిలో ధర (₹)",
            "grade": "నాణ్యత గ్రేడ్ (Grade)",
            "harvestDate": "కోత తేదీ",
            "location": "వ్యవసాయ క్షేత్రం స్థానం",
            "description": "పంట వివరాలు",
            "uploadPhotos": "పంట ఫోటోలు / నాణ్యత రుజువులను అప్‌లోడ్ చేయండి",
            "submitListing": "పంటను నమోదు చేయండి",
            "myListings": "నా యాక్టివ్ లిస్టింగ్‌లు"
      },
      "about": {
            "title": "కృషిసేతు గురించి",
            "subtitle": "భారతీయ రైతులకు మరియు వినియోగదారులకు మధ్య ప్రత్యక్ష వారధి",
            "missionTitle": "మా లక్ష్యం",
            "missionText": "కృషిసేతు అనేది మధ్యవర్తులను తొలగించి, ప్రామాణిక మండీ ధరలను అందిస్తూ రైతులు మరియు కొనుగోలుదారుల మధ్య నమ్మకమైన నాణ్యతను నెలకొల్పే బహిరంగ, పారదర్శక వేదిక.",
            "pillarDataTrust": "డేటా విశ్వసనీయత: ధరలలో ఎటువంటి తారుమారు లేదు; 100% అధికారిక AGMARKNET డేటా.",
            "pillarQualityTrust": "నాణ్యత విశ్వసనీయత: అసలైన ఫోటోలు మరియు గ్రేడింగ్ ఆధారాలతో పారదర్శక సమాచారం.",
            "pillarTransactionTrust": "లావాదేవీల విశ్వసనీయత: దశలవారీ ఆర్డర్ ట్రాకింగ్ మరియు న్యాయమైన వివాద పరిష్కారం."
      },
      "auth": {
            "signInTitle": "కృషిసేతులో లాగిన్ అవ్వండి",
            "signUpTitle": "కొత్త ఖాతాను సృష్టించండి",
            "contactLabel": "మొబైల్ నంబర్ లేదా ఇమెయిల్",
            "passwordLabel": "పాస్‌వర్డ్",
            "nameLabel": "పూర్తి పేరు",
            "roleLabel": "మీ పాత్ర:",
            "roleBuyer": "తాజా పంటలను కొనండి (వినియోగదారుడు / చిల్లర వ్యాపారి)",
            "roleSeller": "పంటను అమ్మండి (రైతు / FPO)",
            "signInBtn": "లాగిన్",
            "signUpBtn": "ఖాతా సృష్టించండి",
            "forgotPassword": "పాస్‌వర్డ్ మర్చిపోయారా?",
            "or": "లేదా"
      },
      "chat": {
            "title": "కృషిసేతు AI సహాయకుడు",
            "subtitle": "ధృవీకరించబడిన వ్యవసాయ AI సహాయకుడు",
            "welcomeMessage": "నమస్కారం! నేను మీ కృషిసేతు AI సహాయకుడిని. నేడు పంటలు, మండీ ధరలు, నాణ్యత లేదా మార్కెట్ ఆర్డర్లలో నేను మీకు ఎలా సహాయపడగలను?",
            "inputPlaceholder": "పంటలు, మండీ ధరలు, నాణ్యత గురించి అడగండి...",
            "send": "పంపండి",
            "clear": "సంభాషణను క్లియర్ చేయండి",
            "close": "మూసివేయండి",
            "typing": "ఆలోచిస్తోంది...",
            "signInRequired": "కృషిసేతు సహాయకుడితో చాట్ చేయడానికి దయచేసి లాగిన్ అవ్వండి",
            "signInPrompt": "మండీ ధరలు, నాణ్యత మరియు ఆర్డర్ల గురించి తెలుసుకోవడానికి లాగిన్ అవ్వండి.",
            "promptQuality": "ఉత్పత్తి నాణ్యత ఎలా తనిఖీ చేయబడుతుంది?",
            "promptMandi": "మండీ ధరలను చూడండి",
            "promptBuy": "పంటను ఎలా కొనుగోలు చేయాలి?",
            "promptSell": "అమ్మకం కోసం పంటను ఎలా నమోదు చేయాలి?",
            "errorGeneric": "క్షమించండి, ఏదో లోపం జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
            "aiUnavailable": "AI సహాయక సేవ ప్రస్తుతం అందుబాటులో లేదు."
      },
      "voice": {
            "startListening": "వాయిస్‌తో మాట్లాడండి (మైక్ ప్రారంభించండి)",
            "stopListening": "వినడం ఆపండి",
            "listening": "వింటోంది... ఇప్పుడు మాట్లాడండి",
            "processing": "వాయిస్ ప్రాసెస్ అవుతోంది...",
            "speakResponse": "సమాధానం వినండి",
            "stopSpeaking": "మాట్లాడటం ఆపండి",
            "speaking": "మాట్లాడుతోంది...",
            "autoSpeechOn": "ఆటో-వాయిస్ ఆన్ చేయబడింది",
            "autoSpeechOff": "ఆటో-వాయిస్ ఆఫ్ చేయబడింది",
            "toggleAutoSpeech": "ఆటో-వాయిస్ సమాధానాన్ని మార్చండి",
            "unsupported": "ఈ బ్రౌజర్‌లో వాయిస్ ఇన్‌పుట్ సపోర్ట్ లేదు. దయచేసి టైప్ చేయండి.",
            "permissionDenied": "మైక్రోఫోన్ అనుమతి నిరాకరించబడింది. దయచేసి బ్రౌజర్ సెట్టింగ్‌లలో అనుమతించండి.",
            "noSpeech": "ఎటువంటి శబ్దం వినిపించలేదు. దయచేసి మైక్ నొక్కి మళ్లీ మాట్లాడండి.",
            "recognitionError": "వాయిస్ గుర్తింపులో సమస్య వచ్చింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
            "speechUnavailable": "ఈ పరికరంలో స్పీచ్ సింథసిస్ అందుబాటులో లేదు."
      }
}
  };

  let currentLanguage = DEFAULT_LANGUAGE;
  let isInitialized = false;

  function getNestedValue(obj, keyPath) {
    if (!obj || typeof obj !== 'object' || !keyPath) return null;
    const parts = keyPath.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[part];
    }
    return (typeof cur === 'string') ? cur : null;
  }

  function interpolate(text, params) {
    if (!text || !params || typeof params !== 'object') return text;
    return text.replace(/\{(\w+)\}/g, (match, paramName) => {
      return Object.prototype.hasOwnProperty.call(params, paramName) ? params[paramName] : match;
    });
  }

  function translate(key, params = {}, lang = currentLanguage) {
    if (!key || typeof key !== 'string') return '';
    const targetLang = SUPPORTED_LANGUAGES[lang] ? lang : DEFAULT_LANGUAGE;

    // Lookup in target language
    let val = getNestedValue(translations[targetLang], key);

    // Fallback to English if missing in target language
    if (val === null && targetLang !== DEFAULT_LANGUAGE) {
      val = getNestedValue(translations[DEFAULT_LANGUAGE], key);
    }

    // Fallback to the key itself if not found
    if (val === null) {
      return key;
    }

    return interpolate(val, params);
  }

  function getSavedLanguage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED_LANGUAGES[saved]) {
          return saved;
        }
      }
    } catch (e) {
      // Storage access blocked or restricted
    }
    return DEFAULT_LANGUAGE;
  }

  function saveLanguage(lang) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (e) {
      // Storage access blocked or restricted
    }
  }

  function updateDomLanguage(lang) {
    if (typeof document !== 'undefined') {
      const htmlEl = document.documentElement;
      if (htmlEl) {
        htmlEl.setAttribute('lang', lang);
        htmlEl.setAttribute('dir', SUPPORTED_LANGUAGES[lang]?.dir || 'ltr');
      }

      // Sync language selector inputs
      const selectors = document.querySelectorAll('[data-language-selector], #languageSelector, #mobileLanguageSelector');
      selectors.forEach(sel => {
        if (sel && sel.value !== lang) {
          sel.value = lang;
        }
      });
    }
  }

  function applyTranslations(rootNode) {
    if (typeof document === 'undefined') return;
    const root = rootNode || document;

    // 1. Text elements: data-i18n
    const textEls = root.querySelectorAll('[data-i18n]');
    textEls.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const translated = translate(key);
      if (!translated) return;

      // Safety check: if element has icon or complex children, only update dedicated text span or check structure
      if (el.children.length === 0) {
        el.textContent = translated;
      } else {
        // If element contains child text nodes or spans, only update direct text node or child with text
        const textSpan = el.querySelector(':scope > [data-i18n-text], :scope > .i18n-label');
        if (textSpan) {
          textSpan.textContent = translated;
        } else {
          // Find first text child node
          let foundTextNode = false;
          for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i];
            if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim().length > 0) {
              child.nodeValue = ' ' + translated.trim() + ' ';
              foundTextNode = true;
              break;
            }
          }
          if (!foundTextNode) {
            el.textContent = translated;
          }
        }
      }
    });

    // 2. Placeholders: data-i18n-placeholder
    const placeholderEls = root.querySelectorAll('[data-i18n-placeholder]');
    placeholderEls.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.setAttribute('placeholder', translate(key));
      }
    });

    // 3. Titles / Tooltips: data-i18n-title
    const titleEls = root.querySelectorAll('[data-i18n-title]');
    titleEls.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.setAttribute('title', translate(key));
      }
    });

    // 4. Accessibility labels: data-i18n-aria-label
    const ariaEls = root.querySelectorAll('[data-i18n-aria-label]');
    ariaEls.forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) {
        el.setAttribute('aria-label', translate(key));
      }
    });

    // 5. Image Alt: data-i18n-alt
    const altEls = root.querySelectorAll('[data-i18n-alt]');
    altEls.forEach(el => {
      const key = el.getAttribute('data-i18n-alt');
      if (key) {
        el.setAttribute('alt', translate(key));
      }
    });
  }

  function setLanguage(lang) {
    const validLang = SUPPORTED_LANGUAGES[lang] ? lang : DEFAULT_LANGUAGE;
    const previousLang = currentLanguage;
    currentLanguage = validLang;

    saveLanguage(validLang);
    updateDomLanguage(validLang);
    applyTranslations();

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        const event = new CustomEvent('krishisetu:language-changed', {
          detail: {
            language: validLang,
            previousLanguage: previousLang
          }
        });
        window.dispatchEvent(event);
      } catch (e) {
        // CustomEvent fallback for legacy environments
      }
    }

    return validLang;
  }

  function getCurrentLanguage() {
    return currentLanguage;
  }

  function getSupportedLanguages() {
    return { ...SUPPORTED_LANGUAGES };
  }

  function registerTranslations(langCode, dict, meta = {}) {
    if (!langCode || !dict || typeof dict !== 'object') return false;
    translations[langCode] = {
      ...(translations[langCode] || {}),
      ...dict
    };
    SUPPORTED_LANGUAGES[langCode] = {
      code: langCode,
      name: meta.name || langCode,
      nativeName: meta.nativeName || meta.name || langCode,
      dir: meta.dir || 'ltr'
    };
    return true;
  }

  function init() {
    if (isInitialized) {
      applyTranslations();
      return;
    }

    currentLanguage = getSavedLanguage();
    updateDomLanguage(currentLanguage);
    applyTranslations();

    // Listen for language selector change events on document
    if (typeof document !== 'undefined') {
      document.addEventListener('change', function (e) {
        if (e.target && (e.target.matches('[data-language-selector]') || e.target.id === 'languageSelector' || e.target.id === 'mobileLanguageSelector')) {
          setLanguage(e.target.value);
        }
      });
    }

    isInitialized = true;
  }

  return {
    init,
    initializeI18n: init,
    setLanguage,
    getCurrentLanguage,
    getLanguage: getCurrentLanguage,
    t: translate,
    translate,
    applyTranslations,
    getSupportedLanguages,
    registerTranslations,
    DEFAULT_LANGUAGE,
    STORAGE_KEY
  };
}));
