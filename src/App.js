/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, addDoc, serverTimestamp, getDocs, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore'; // Added deleteDoc

// Helper function to generate a simple unique SKU
const generateSKU = () => {
    return `SKU-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
};

// Default Admin Password (for demonstration purposes)
const ADMIN_PASSWORD = "adminpass123";

// Main App component
const App = () => {
    // State variables for Firebase and user
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isAdminMode, setIsAdminMode] = useState(false); // State for admin mode

    // State for admin login modal
    const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
    const [adminPasswordInput, setAdminPasswordInput] = useState('');
    const [adminLoginError, setAdminLoginError] = useState('');

    // State variables for inventory metrics
    const [totalItems, setTotalItems] = useState(0);
    const [stockOutItems, setStockOutItems] = useState(0);
    const [totalSales, setTotalSales] = useState(0);
    const [totalCapital, setTotalCapital] = useState(0);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    // State for managing modals/messages
    const [message, setMessage] = useState('');
    const [showMessageModal, setShowMessageModal] = useState(false);

    // State for Manage Stock modal
    const [showManageStockModal, setShowManageStockModal] = useState(false);
    const [activeManageStockTab, setActiveManageStockTab] = useState('add-new-stocks'); // 'add-new-stocks' or 'multiple-restocking'

    // State for View Inventory modal
    const [showViewInventoryModal, setShowViewInventoryModal] = useState(false);
    const [viewInventorySearchQuery, setViewInventorySearchQuery] = useState(''); // New state for search in View Inventory

    // State for Edit Item modal
    const [showEditItemModal, setShowEditItemModal] = useState(false);
    const [selectedItemToEdit, setSelectedItemToEdit] = useState(null);

    // State for Confirm Delete modal
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    // State for Low Stock notification modal
    const [showLowStockModal, setShowLowStockModal] = useState(false);
    const [lowStockItems, setLowStockItems] = useState([]);
    const lowStockRef = useRef(null); // Ref for the low stock content for printing

    // State for New Sale modal
    const [showNewSaleModal, setShowNewSaleModal] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [customerContact, setCustomerContact] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [saleSearchQuery, setSaleSearchQuery] = useState('');
    const [purchaseCart, setPurchaseCart] = useState([]); // [{ id, name, sku, price, quantity, total }]

    // State for sales invoice modal (after confirming sale)
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [invoiceData, setInvoiceData] = useState(null);
    const invoiceRef = useRef(null); // Ref for the invoice content for printing

    // State for recent sales modal
    const [showRecentSalesModal, setShowRecentSalesModal] = useState(false);
    const [recentSalesData, setRecentSalesData] = useState([]);
    const recentSalesRef = useRef(null); // Ref for the recent sales content for printing

    // State for sale summary modal (when clicking on a sale ID)
    const [showSaleSummaryModal, setShowSaleSummaryModal] = useState(false);
    const [selectedSaleSummary, setSelectedSaleSummary] = useState(null);
    const saleSummaryRef = useRef(null); // Ref for the sale summary content for printing

    // State for Activity Logs modal
    const [showActivityLogsModal, setShowActivityLogsModal] = useState(false);
    const [activityLogsData, setActivityLogsData] = useState([]);
    const activityLogsRef = useRef(null);


    // State for inventory items (used across multiple modals)
    const [inventoryItems, setInventoryItems] = useState([]);

    // State for temporary quantities in restock inputs (before adding to cart)
    const [tempRestockQuantities, setTempRestockQuantities] = useState({}); // { itemId: quantity }

    // State for items in the restock "cart"
    const [restockCart, setRestockCart] = useState([]);

    // State for search query for the "Multiple Restocking" tab
    const [searchQuery, setSearchQuery] = useState('');


    // Initialize Firebase and set up authentication listener
    useEffect(() => {
        try {
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authentication = getAuth(app);

            setDb(firestore);
            setAuth(authentication);

            const unsubscribeAuth = onAuthStateChanged(authentication, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    if (initialAuthToken) {
                        await signInWithCustomToken(authentication, initialAuthToken);
                    } else {
                        await signInAnonymously(authentication);
                    }
                }
            });

            return () => unsubscribeAuth();
        } catch (error) {
            console.error("Error initializing Firebase:", error);
            setErrorMessage(`Failed to initialize Firebase: ${error.message}`);
            setLoading(false);
        }
    }, []);

    // Fetch data from Firestore once authentication is ready
    useEffect(() => {
        if (!isAuthReady || !db || !userId) {
            return;
        }

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const itemsCollectionPath = `artifacts/${appId}/users/${userId}/items`;
        const salesCollectionPath = `artifacts/${appId}/users/${userId}/sales`;
        const activitiesCollectionPath = `artifacts/${appId}/users/${userId}/activities`; // New activities path


        // Check if collections are empty and add dummy data if needed
        const checkAndAddDummyData = async () => {
            const itemsRef = collection(db, itemsCollectionPath);
            const itemsSnapshot = await getDocs(itemsRef);
            if (itemsSnapshot.empty) {
                console.log("No items found, adding dummy data...");
                await addDoc(itemsRef, {
                    sku: generateSKU(),
                    name: "Oil Filter (Dummy)",
                    description: "Standard oil filter for motorcycles",
                    brand: "MotoParts",
                    stock: 50,
                    costPrice: 150,
                    sellingPrice: 250,
                    reorderLevel: 10,
                    createdAt: serverTimestamp()
                });
                await addDoc(itemsRef, {
                    sku: generateSKU(),
                    name: "Spark Plug (Dummy)",
                    description: "High-performance spark plug",
                    brand: "NGK",
                    stock: 0, // Stock out item
                    costPrice: 80,
                    sellingPrice: 120,
                    reorderLevel: 5,
                    createdAt: serverTimestamp()
                });
                await addDoc(itemsRef, {
                    sku: generateSKU(),
                    name: "Brake Pad Set (Dummy)",
                    description: "Front brake pad set",
                    brand: "BrakePro",
                    stock: 25,
                    costPrice: 400,
                    sellingPrice: 650,
                    reorderLevel: 20,
                    createdAt: serverTimestamp()
                });
                await addDoc(itemsRef, {
                    sku: generateSKU(),
                    name: "Tire (Dummy)",
                    description: "Motorcycle rear tire",
                    brand: "TireX",
                    stock: 8,
                    costPrice: 1200,
                    sellingPrice: 1800,
                    reorderLevel: 10,
                    createdAt: serverTimestamp()
                });
            }

            const salesRef = collection(db, salesCollectionPath);
            const salesSnapshot = await getDocs(salesRef);
            if (salesSnapshot.empty) {
                console.log("No sales found, adding dummy data...");
                await addDoc(salesRef, {
                    customerName: "John Doe",
                    customerAddress: "123 Main St",
                    customerContact: "555-1234",
                    customerEmail: "john.doe@example.com",
                    items: [
                        { itemId: "dummyItemId1", itemName: "Oil Filter (Dummy)", quantitySold: 2, sellingPriceAtSale: 250 },
                        { itemId: "dummyItemId2", itemName: "Brake Pad Set (Dummy)", quantitySold: 1, sellingPriceAtSale: 650 }
                    ],
                    totalAmount: 2 * 250 + 1 * 650,
                    timestamp: serverTimestamp()
                });
            }
        };

        checkAndAddDummyData().catch(e => {
            console.error("Error adding dummy data:", e);
            setErrorMessage(`Error initializing data: ${e.message}`);
        });

        // Listen for real-time updates to items
        const unsubscribeItems = onSnapshot(collection(db, itemsCollectionPath), (snapshot) => {
            let total = 0;
            let stockOut = 0;
            let capital = 0;
            const fetchedItems = [];
            const lowStocks = [];
            snapshot.forEach((doc) => {
                const item = { id: doc.id, ...doc.data() };
                fetchedItems.push(item);
                total++;
                if (item.stock === 0) {
                    stockOut++;
                }
                capital += item.stock * item.costPrice;

                if (item.reorderLevel !== undefined && item.stock <= item.reorderLevel) {
                    lowStocks.push(item);
                }
            });
            setTotalItems(total);
            setStockOutItems(stockOut);
            setTotalCapital(capital);
            setInventoryItems(fetchedItems);
            setLowStockItems(lowStocks);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching items:", error);
            setErrorMessage(`Failed to load items: ${error.message}`);
            setLoading(false);
        });

        // Listen for real-time updates to sales for total sales and recent sales data
        const unsubscribeSales = onSnapshot(collection(db, salesCollectionPath), (snapshot) => {
            let salesTotal = 0;
            const fetchedSales = [];
            snapshot.forEach((doc) => {
                const sale = { id: doc.id, ...doc.data() };
                salesTotal += sale.totalAmount || 0;
                fetchedSales.push(sale);
            });
            // Sort sales by timestamp descending for "recent" sales
            fetchedSales.sort((a, b) => {
                const dateA = a.timestamp ? a.timestamp.toDate() : new Date(0); // Handle null/undefined timestamp
                const dateB = b.timestamp ? b.timestamp.toDate() : new Date(0);
                return dateB.getTime() - dateA.getTime();
            });
            setTotalSales(salesTotal);
            setRecentSalesData(fetchedSales);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching sales:", error);
            setErrorMessage(`Failed to load sales data: ${error.message}`);
            setLoading(false);
        });

        // Listen for real-time updates to activities
        const unsubscribeActivities = onSnapshot(collection(db, activitiesCollectionPath), (snapshot) => {
            const fetchedActivities = [];
            snapshot.forEach((doc) => {
                const activity = { id: doc.id, ...doc.data() };
                fetchedActivities.push(activity);
            });
            // Sort activities by timestamp descending
            fetchedActivities.sort((a, b) => {
                const dateA = a.timestamp ? a.timestamp.toDate() : new Date(0);
                const dateB = b.timestamp ? b.timestamp.toDate() : new Date(0);
                return dateB.getTime() - dateA.getTime();
            });
            setActivityLogsData(fetchedActivities);
        }, (error) => {
            console.error("Error fetching activities:", error);
            // Do not set errorMessage here as it might override critical errors for main app
        });


        // Cleanup listeners on component unmount
        return () => {
            unsubscribeItems();
            unsubscribeSales();
            unsubscribeActivities(); // Add this cleanup
        };
    }, [isAuthReady, db, userId]);

    // Function to show message modal
    const showMessageBox = (msg) => {
        setMessage(msg);
        setShowMessageModal(true);
    };

    // Function to close message modal
    const closeMessageBox = () => {
        setShowMessageModal(false);
        setMessage('');
    };

    // Handle new item submission
    const handleAddNewItem = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            showMessageBox("Firebase not ready. Please wait.");
            return;
        }
        if (!isAdminMode) { // Ensure admin mode is active
            showMessageBox("Unauthorized access. Please log in as administrator.");
            return;
        }

        const form = e.target;
        const name = form.itemName.value;
        const description = form.itemDescription.value;
        const brand = form.itemBrand.value;
        const stock = parseInt(form.itemStock.value);
        const costPrice = parseFloat(form.itemCostPrice.value);
        const sellingPrice = parseFloat(form.itemSellingPrice.value);
        const reorderLevel = parseInt(form.itemReorderLevel.value);
        const sku = generateSKU();

        if (!name || !description || !brand || isNaN(stock) || isNaN(costPrice) || isNaN(sellingPrice) || isNaN(reorderLevel)) {
            showMessageBox("Please fill all fields correctly for the new item.");
            return;
        }

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/items`), {
                sku,
                name,
                description,
                brand,
                stock,
                costPrice,
                sellingPrice,
                reorderLevel,
                createdAt: serverTimestamp()
            });

            // Log the activity
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/activities`), {
                timestamp: serverTimestamp(),
                type: 'ITEM_ADDED',
                description: `New item '${name}' (SKU: ${sku}) added.`,
                details: { itemId: docRef.id, itemName: name, sku, stock }
            });

            showMessageBox("New item added successfully!");
            form.reset();
            setShowManageStockModal(false); // Close the modal after successful addition
        } catch (error) {
            console.error("Error adding document: ", error);
            showMessageBox(`Error adding new item: ${error.message}`);
        }
    };

    // Handle quantity change for the temporary input (not yet in restock cart)
    const handleTempRestockQuantityChange = (itemId, quantity) => {
        setTempRestockQuantities(prev => ({
            ...prev,
            [itemId]: parseInt(quantity) || 0
        }));
    };

    // Add item to restock cart
    const handleAddToRestockCart = (item) => {
        const quantityToAdd = tempRestockQuantities[item.id] || 0;
        if (quantityToAdd <= 0) {
            showMessageBox("Please enter a quantity greater than zero to add to restock list.");
            return;
        }

        setRestockCart(prevCart => {
            const existingItemIndex = prevCart.findIndex(cartItem => cartItem.id === item.id);
            if (existingItemIndex > -1) {
                const updatedCart = [...prevCart];
                updatedCart[existingItemIndex] = {
                    ...updatedCart[existingItemIndex],
                    quantityToRestock: updatedCart[existingItemIndex].quantityToRestock + quantityToAdd
                };
                return updatedCart;
            } else {
                return [...prevCart, {
                    id: item.id,
                    name: item.name,
                    sku: item.sku,
                    currentStock: item.stock,
                    quantityToRestock: quantityToAdd
                }];
            }
        });
        setTempRestockQuantities(prev => {
            const newState = { ...prev };
            delete newState[item.id];
            return newState;
        });
        showMessageBox(`${quantityToAdd} of ${item.name} added to restock list.`);
    };

    // Remove item from restock cart
    const handleRemoveFromRestockCart = (itemId) => {
        setRestockCart(prevCart => prevCart.filter(item => item.id !== itemId));
    };


    // Handle restocking of multiple items from the cart
    const handleRestockMultipleItems = async () => {
        if (!db || !userId) {
            showMessageBox("Firebase not ready. Please wait.");
            return;
        }
        if (!isAdminMode) { // Ensure admin mode is active
            showMessageBox("Unauthorized access. Please log in as administrator.");
            return;
        }

        if (restockCart.length === 0) {
            showMessageBox("Restock list is empty. Add items to restock first.");
            return;
        }

        const updates = [];
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        for (const cartItem of restockCart) {
            const itemRef = doc(db, `artifacts/${appId}/users/${userId}/items`, cartItem.id);
            const currentItem = inventoryItems.find(item => item.id === cartItem.id);
            if (currentItem) {
                const newStock = currentItem.stock + cartItem.quantityToRestock;
                updates.push(updateDoc(itemRef, { stock: newStock }));
            }
        }

        try {
            await Promise.all(updates);
            // Log individual restocks or a single bulk restock
            const restockDescription = restockCart.map(item => `${item.quantityToStock} of ${item.name}`).join(', ');
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/activities`), {
                timestamp: serverTimestamp(),
                type: 'STOCK_UPDATED',
                description: `Restocked items: ${restockDescription}.`,
                details: restockCart.map(item => ({ itemId: item.id, itemName: item.name, quantityRestocked: item.quantityToRestock }))
            });

            showMessageBox("Selected items restocked successfully!");
            setRestockCart([]); // Clear the restock cart
            setShowManageStockModal(false); // Close modal after successful restocking
        } catch (error) {
            console.error("Error restocking items:", error);
            showMessageBox(`Error restocking items: ${error.message}`);
        }
    };

    // Filtered items for restocking based on search query for Manage Stock Tab
    const filteredRestockItems = inventoryItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Purchase Cart Logic:
    const handleQuantityChangeInSaleInput = (itemId, quantity) => { // Renamed to avoid confusion with cart quantity
        setInventoryItems(prevItems => prevItems.map(invItem =>
            invItem.id === itemId ? { ...invItem, quantityInSale: parseInt(quantity) || '' } : invItem // Keep empty string for blank input
        ));
    };


    const handleAddProductToPurchaseCart = (item) => {
        const quantity = item.quantityInSale || 0; // Get quantity from item's temp input
        if (quantity <= 0) {
            showMessageBox("Please enter a quantity greater than zero to add to cart.");
            return;
        }
        if (item.stock < quantity) {
            showMessageBox(`Only ${item.stock} of ${item.name} available.`);
            return;
        }

        setPurchaseCart(prevCart => {
            const existingItemIndex = prevCart.findIndex(cartItem => cartItem.id === item.id);
            if (existingItemIndex > -1) {
                const updatedCart = [...prevCart];
                const newQuantity = updatedCart[existingItemIndex].quantity + quantity;
                if (item.stock < newQuantity) { // Re-check total quantity against available stock
                    showMessageBox(`Adding ${quantity} would exceed available stock. Only ${item.stock} of ${item.name} available.`);
                    return updatedCart;
                }
                updatedCart[existingItemIndex] = {
                    ...updatedCart[existingItemIndex],
                    quantity: newQuantity,
                    total: newQuantity * updatedCart[existingItemIndex].price
                };
                return updatedCart;
            } else {
                return [...prevCart, {
                    id: item.id,
                    name: item.name,
                    sku: item.sku,
                    price: item.sellingPrice,
                    quantity: quantity,
                    total: quantity * item.sellingPrice,
                    availableStock: item.stock // Store available stock for validation
                }];
            }
        });
        // Clear temp quantity for the item from the item list after adding to cart
        setInventoryItems(prevItems => prevItems.map(invItem =>
            invItem.id === item.id ? { ...invItem, quantityInSale: '' } : invItem
        ));
        showMessageBox(`${quantity} of ${item.name} added to purchase cart.`);
    };

    const handleRemoveFromPurchaseCart = (itemId) => {
        setPurchaseCart(prevCart => prevCart.filter(item => item.id !== itemId));
    };

    const calculatePurchaseTotal = () => {
        return purchaseCart.reduce((total, item) => total + (item.total || 0), 0);
    };

    const handleConfirmSale = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            showMessageBox("Firebase not ready. Please wait.");
            return;
        }
        if (purchaseCart.length === 0) {
            showMessageBox("Purchase list is empty. Add items to sell first.");
            return;
        }
        if (!customerName || !customerAddress || !customerContact) {
            showMessageBox("Please fill in Customer Name, Address, and Contact Number.");
            return;
        }

        const batchUpdates = [];
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        // Prepare item stock updates
        for (const item of purchaseCart) {
            // Re-fetch current stock to ensure accuracy before updating
            const currentInventoryItem = inventoryItems.find(invItem => invItem.id === item.id);
            if (!currentInventoryItem || currentInventoryItem.stock < item.quantity) {
                showMessageBox(`Not enough stock for ${item.name}. Available: ${currentInventoryItem ? currentInventoryItem.stock : 0}, Requested: ${item.quantity}`);
                return; // Stop the sale if stock is insufficient
            }
            const newStock = currentInventoryItem.stock - item.quantity;
            const itemRef = doc(db, `artifacts/${appId}/users/${userId}/items`, item.id);
            batchUpdates.push(updateDoc(itemRef, { stock: newStock }));
        }

        // Prepare sales record
        const saleRecord = {
            customerName,
            customerAddress,
            customerContact,
            customerEmail: customerEmail || 'N/A',
            items: purchaseCart.map(item => ({
                itemId: item.id,
                itemName: item.name,
                sku: item.sku,
                quantitySold: item.quantity,
                sellingPriceAtSale: item.price,
                total: item.total
             })),
            totalAmount: calculatePurchaseTotal(),
            timestamp: serverTimestamp()
        };
        const salesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/sales`);

        try {
            const docRef = await addDoc(salesCollectionRef, saleRecord); // Get docRef for the newly added sale
            await Promise.all(batchUpdates);

            // Log the sale activity
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/activities`), {
                timestamp: serverTimestamp(),
                type: 'SALE_COMPLETED',
                description: `Sale completed for ${customerName}. Total: ₱${calculatePurchaseTotal().toLocaleString()}.`,
                details: { saleId: docRef.id, customerName, totalAmount: calculatePurchaseTotal(), itemsSold: purchaseCart.map(item => ({ itemId: item.id, quantity: item.quantity, price: item.price })) }
            });


            // Prepare invoice data
            const newInvoiceData = {
                id: docRef.id,
                customerName,
                customerAddress,
                customerContact,
                customerEmail,
                items: purchaseCart.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.total
                })),
                totalAmount: calculatePurchaseTotal(),
                timestamp: new Date().toLocaleString() // Use local date string for display
            };
            setInvoiceData(newInvoiceData);
            setShowNewSaleModal(false); // Close sale modal
            setShowInvoiceModal(true); // Open invoice modal

            showMessageBox("Sale confirmed successfully! Invoice ready.");
            // Reset form and cart
            setCustomerName('');
            setCustomerAddress('');
            setCustomerContact('');
            setCustomerEmail('');
            setPurchaseCart([]);
            setSaleSearchQuery('');

        } catch (error) {
            console.error("Error confirming sale:", error);
            showMessageBox(`Error confirming sale: ${error.message}`);
        }
    };

    // Generic print function
    const handlePrintContent = (contentRef, title) => {
        if (contentRef.current) {
            const printContent = contentRef.current.innerHTML;
            const printWindow = window.open('', '', 'height=600,width=800');
            printWindow.document.write('<html><head><title>' + title + '</title>');
            printWindow.document.write('<link href="https://cdn.tailwindcss.com" rel="stylesheet">');
            printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />');
            printWindow.document.write('<style>');
            printWindow.document.write(`
                body { font-family: 'Inter', sans-serif; margin: 20px; color: #333; }
                .report-container { width: 100%; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
                h1, h2, h3 { color: #1a202c; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .total-row td { font-weight: bold; border-top: 2px solid #333; }
                .print-hidden { display: none; }
                @media print {
                    body > *:not(.modal-to-print) {
                        display: none !important;
                    }
                    .modal-to-print {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: none !important;
                        overflow: visible !important;
                        display: block !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                    }
                    .modal-to-print .print-hidden {
                        display: none !important;
                    }
                }
            `);
            printWindow.document.write('</style></head><body>');
            printWindow.document.write('<div class="report-container">');
            printWindow.document.write(printContent);
            printWindow.document.write('</div></body></html>');
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        } else {
            showMessageBox("Content not ready for printing.");
        }
    };

    // Function to show sale summary modal
    const handleViewSaleSummary = (sale) => {
        setSelectedSaleSummary(sale);
        setShowSaleSummaryModal(true);
    };

    // Handle Admin Login Attempt
    const handleAdminLogin = (e) => {
        e.preventDefault();
        if (adminPasswordInput === ADMIN_PASSWORD) {
            setIsAdminMode(true);
            setShowAdminLoginModal(false);
            setAdminLoginError('');
            setAdminPasswordInput(''); // Clear password input
            showMessageBox("Admin mode activated successfully!");
        } else {
            setAdminLoginError("Invalid password.");
        }
    };

    // Toggle admin mode (show login modal or logout)
    const toggleAdminMode = () => {
        if (isAdminMode) {
            setIsAdminMode(false);
            showMessageBox("Admin mode deactivated.");
        } else {
            setShowAdminLoginModal(true);
            setAdminLoginError(''); // Clear previous errors
            setAdminPasswordInput(''); // Clear password input
        }
    };

    // Handle Edit Item
    const handleEditItemClick = (item) => {
        if (!isAdminMode) {
            showMessageBox("Unauthorized access. Please log in as administrator to edit items.");
            return;
        }
        setSelectedItemToEdit(item);
        setShowEditItemModal(true);
    };

    const handleUpdateItem = async (e) => {
        e.preventDefault();
        if (!db || !userId || !selectedItemToEdit) {
            showMessageBox("Error: Database or item not ready.");
            return;
        }
        if (!isAdminMode) {
            showMessageBox("Unauthorized action.");
            return;
        }

        const form = e.target;
        const updatedName = form.itemName.value;
        const updatedDescription = form.itemDescription.value;
        const updatedBrand = form.itemBrand.value;
        const updatedStock = parseInt(form.itemStock.value);
        const updatedCostPrice = parseFloat(form.itemCostPrice.value);
        const updatedSellingPrice = parseFloat(form.itemSellingPrice.value);
        const updatedReorderLevel = parseInt(form.itemReorderLevel.value);

        if (!updatedName || !updatedDescription || !updatedBrand || isNaN(updatedStock) || isNaN(updatedCostPrice) || isNaN(updatedSellingPrice) || isNaN(updatedReorderLevel)) {
            showMessageBox("Please fill all fields correctly for the item update.");
            return;
        }

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const itemRef = doc(db, `artifacts/${appId}/users/${userId}/items`, selectedItemToEdit.id);
            await updateDoc(itemRef, {
                name: updatedName,
                description: updatedDescription,
                brand: updatedBrand,
                stock: updatedStock,
                costPrice: updatedCostPrice,
                sellingPrice: updatedSellingPrice,
                reorderLevel: updatedReorderLevel
            });

            // Log the activity
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/activities`), {
                timestamp: serverTimestamp(),
                type: 'ITEM_UPDATED',
                description: `Item '${selectedItemToEdit.name}' (SKU: ${selectedItemToEdit.sku}) updated.`,
                details: { itemId: selectedItemToEdit.id, itemName: updatedName, sku: selectedItemToEdit.sku }
            });


            showMessageBox("Item updated successfully!");
            setShowEditItemModal(false);
            setSelectedItemToEdit(null);
        } catch (error) {
            console.error("Error updating document: ", error);
            showMessageBox(`Error updating item: ${error.message}`);
        }
    };

    // Handle Remove Item
    const handleRemoveItemClick = (item) => {
        if (!isAdminMode) {
            showMessageBox("Unauthorized access. Please log in as administrator to remove items.");
            return;
        }
        setItemToDelete(item);
        setShowConfirmDeleteModal(true);
    };

    const confirmRemoveItem = async () => {
        if (!db || !userId || !itemToDelete) {
            showMessageBox("Error: Database or item to delete not ready.");
            return;
        }
        if (!isAdminMode) {
            showMessageBox("Unauthorized action.");
            return;
        }

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const itemRef = doc(db, `artifacts/${appId}/users/${userId}/items`, itemToDelete.id);
            await deleteDoc(itemRef);

            // Log the activity
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/activities`), {
                timestamp: serverTimestamp(),
                type: 'ITEM_REMOVED',
                description: `Item '${itemToDelete.name}' (SKU: ${itemToDelete.sku}) removed.`,
                details: { itemId: itemToDelete.id, itemName: itemToDelete.name, sku: itemToDelete.sku }
            });

            showMessageBox("Item removed successfully!");
            setShowConfirmDeleteModal(false);
            setItemToDelete(null);
        } catch (error) {
            console.error("Error removing document: ", error);
            showMessageBox(`Error removing item: ${error.message}`);
        }
    };

    // Filtered inventory items for display in View Inventory modal based on search query
    const filteredInventoryItems = inventoryItems.filter(item =>
        item.name.toLowerCase().includes(viewInventorySearchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(viewInventorySearchQuery.toLowerCase()) ||
        item.brand.toLowerCase().includes(viewInventorySearchQuery.toLowerCase())
    );


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter p-4">
                <p className="text-xl text-gray-700">Loading inventory data...</p>
            </div>

        );
    }

    if (errorMessage) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-red-100 text-red-800 font-inter p-4">
                <p className="text-xl mb-4">Error: {errorMessage}</p>
                <p>Please check your Firebase configuration or try again later.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-inter">
            <script src="https://cdn.tailwindcss.com"></script>
            {/* Google Fonts - Inter */}
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

            <style>
                {`
                body {
                    font-family: 'Inter', sans-serif;
                }
                .main-container {
                    background-image: url('https://placehold.co/1920x1080/0d1a26/94a3b8?text=Mechanic+Background'); /* Placeholder for mechanic background */
                    background-size: cover;
                    background-position: center;
                    background-attachment: fixed;
                    min-height: 100vh; /* Ensure it covers the full viewport height */
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    /* Dark overlay for readability */
                    position: relative;
                    z-index: 1;
                }

                .main-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.5); /* Dark overlay */
                    z-index: -1;
                }


                .card {
                    transition: transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out;
                    border: 1px solid #e2e8f0; /* formal border */
                }
                .card:hover {
                    transform: translateY(-3px); /* subtle lift */
                    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
                }
                .modal-overlay {
                    background-color: rgba(0, 0, 0, 0.6); /* slightly darker overlay */
                }
                .tab-button.active {
                    border-bottom: 3px solid #3b82f6; /* Blue-500 */
                    font-weight: 600;
                    color: #1f2937; /* Gray-800 */
                }
                /* Custom scrollbar for table container */
                .table-container::-webkit-scrollbar {
                    width: 8px;
                }
                .table-container::-webkit-scrollbar-track {
                    background: #f1f5f9; /* slate-100 */
                    border-radius: 10px;
                }
                .table-container::-webkit-scrollbar-thumb {
                    background: #94a3b8; /* slate-400 */
                    border-radius: 10px;
                }
                .table-container::-webkit-scrollbar-thumb:hover {
                    background: #64748b; /* slate-500 */
                }
                /* Print specific styles for invoice/report modals */
                @media print {
                    body > *:not(.modal-to-print) {
                        display: none !important;
                    }
                    .modal-to-print {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: none !important;
                        overflow: visible !important;
                        display: block !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                    }
                    .modal-to-print .print-hidden {
                        display: none !important;
                    }
                }

                /* From Uiverse.io by reglobby */
                .user-profile {
                    width: 131px;
                    height: 51px;
                    border-radius: 15px;
                    cursor: pointer;
                    transition: 0.3s ease;
                    background: linear-gradient(
                        to bottom right,
                        #2e8eff 0%,
                        rgba(46, 142, 255, 0) 30%
                    );
                    background-color: rgba(46, 142, 255, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0; /* Override default button padding */
                    border: none; /* Remove default button border */
                }

                .user-profile:hover,
                .user-profile:focus {
                    background-color: rgba(46, 142, 255, 0.7);
                    box-shadow: 0 0 10px rgba(46, 142, 255, 0.5);
                    outline: none;
                }

                .user-profile-inner {
                    width: 127px;
                    height: 47px;
                    border-radius: 13px;
                    background-color: #1a1a1a;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 15px;
                    color: #fff;
                    font-weight: 600;
                }

                .user-profile-inner svg {
                    width: 27px;
                    height: 27px;
                    fill: #fff;
                }
                `}
            </style>

            <div className="main-container"> {/* Apply background here */}
                <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl p-10 mb-8 relative z-10"> {/* Added relative for positioning admin button */}
                    <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8 tracking-tight">Inventory Management Dashboard</h1> {/* Larger, bolder title */}

                    {/* Admin Login/Logout Button */}
                    <div className="absolute top-6 right-6">
                        <button
                            onClick={toggleAdminMode}
                            className="user-profile" // Applied new custom class
                        >
                            <div className="user-profile-inner"> {/* Inner div for text and icon */}
                                {isAdminMode ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-log-out">
                                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                            <polyline points="17 16 22 12 17 8"/>
                                            <line x1="22" x2="10" y1="12" y2="12"/>
                                        </svg>
                                        Admin Logout
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user">
                                            <circle cx="12" cy="7" r="4"/>
                                            <path d="M12 16v.5c0 2.292-2.122 3.442-3.83 3.992M12 16v.5c0 2.292 2.122 3.442 3.83 3.992"/>
                                            <path d="M16 21.5c-2.316-1.533-4.632-1.533-6.948 0"/>
                                        </svg>
                                        Admin Login
                                    </>
                                )}
                            </div>
                        </button>
                    </div>

                    {/* User ID display */}
                    <div className="text-center text-md text-gray-600 mb-8 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="font-medium">Current User Session ID:</span> <span className="font-semibold text-blue-700 select-all">{userId}</span>
                    </div>

                    {/* Metrics Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                        {/* Total Items Card (Always visible) */}
                        <div className="card bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-xl shadow-lg flex flex-col items-center justify-center text-center">
                            <div className="text-5xl font-extrabold mb-2">{totalItems}</div>
                            <div className="text-lg font-medium opacity-90">Total Items</div>
                        </div>

                        {/* Stock Out Items Card (Always visible) */}
                        <div className="card bg-gradient-to-br from-red-600 to-red-800 text-white p-6 rounded-xl shadow-lg flex flex-col items-center justify-center text-center">
                            <div className="text-5xl font-extrabold mb-2">{stockOutItems}</div>
                            <div className="text-lg font-medium opacity-90">Stock Out Items</div>
                        </div>

                        {/* Total Sales Card (Admin Only) */}
                        {isAdminMode && (
                            <div className="card bg-gradient-to-br from-green-600 to-green-800 text-white p-6 rounded-xl shadow-lg flex flex-col items-center justify-center text-center">
                                <div className="text-4xl font-extrabold mb-2">₱{totalSales.toLocaleString()}</div>
                                <div className="text-lg font-medium opacity-90">Total Sales</div>
                            </div>
                        )}
                        {!isAdminMode && (
                            <div className="card bg-gray-300 text-gray-700 p-6 rounded-xl shadow-lg flex flex-col items-center justify-center text-center">
                                <div className="text-4xl font-extrabold mb-2">****</div>
                                <div className="text-lg font-medium opacity-90">Sales (Admin Only)</div>
                            </div>
                        )}

                        {/* Total Capital Card (Admin Only) */}
                        {isAdminMode && (
                            <div className="card bg-gradient-to-br from-purple-600 to-purple-800 text-white p-6 rounded-xl shadow-lg flex flex-col items-center justify-center text-center">
                                <div className="text-4xl font-extrabold mb-2">₱{totalCapital.toLocaleString()}</div>
                                <div className="text-lg font-medium opacity-90">Total Capital</div>
                            </div>
                        )}
                        {!isAdminMode && (
                            <div className="card bg-gray-300 text-gray-700 p-6 rounded-xl shadow-lg flex flex-col items-center justify-center text-center">
                                <div className="text-4xl font-extrabold mb-2">****</div>
                                <div className="text-lg font-medium opacity-90">Capital (Admin Only)</div>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"> {/* Adjusted columns and gap */}
                        {/* Manage Stock Button (Admin Only) */}
                        {isAdminMode ? (
                            <button
                                onClick={() => setShowManageStockModal(true)}
                                className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-300 active:bg-blue-900"
                            >
                                Manage Stock
                            </button>
                        ) : (
                            <button
                                disabled
                                className="bg-gray-400 text-gray-200 font-bold py-4 px-8 rounded-xl shadow-lg cursor-not-allowed"
                            >
                                Manage Stock (Admin Only)
                            </button>
                        )}
                        {/* View Inventory (Always visible) */}
                        <button
                            onClick={() => setShowViewInventoryModal(true)}
                            className="bg-green-700 hover:bg-green-800 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-green-300 active:bg-green-900"
                        >
                            View Inventory
                        </button>
                        {/* New Sale (Always visible) */}
                        <button
                            onClick={() => setShowNewSaleModal(true)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-yellow-300 active:bg-yellow-800"
                        >
                            New Sale
                        </button>
                        {/* Recent Sales (Always visible) */}
                        <button
                            onClick={() => setShowRecentSalesModal(true)}
                            className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-indigo-300 active:bg-indigo-900"
                        >
                            Recent Sales
                        </button>
                        {/* Low Stock (Always visible) */}
                        <button
                            onClick={() => setShowLowStockModal(true)}
                            className="bg-orange-700 hover:bg-orange-800 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-orange-300 active:bg-orange-900"
                        >
                            Low Stock ({lowStockItems.length})
                        </button>
                        {/* Activity Logs Button (Admin Only) */}
                        {isAdminMode ? (
                            <button
                                onClick={() => setShowActivityLogsModal(true)}
                                className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-gray-300 active:bg-gray-900"
                            >
                                Activity Logs
                            </button>
                        ) : (
                            <button
                                disabled
                                className="bg-gray-400 text-gray-200 font-bold py-4 px-8 rounded-xl shadow-lg cursor-not-allowed"
                            >
                                Activity Logs (Admin Only)
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}

            {/* Message Modal */}
            {showMessageModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-200">
                        <h3 className="text-2xl font-bold mb-4 text-gray-800 text-center">Notification</h3>
                        <p className="text-gray-700 text-lg mb-6 text-center">{message}</p>
                        <button
                            onClick={closeMessageBox}
                            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl transition duration-300 focus:outline-none focus:ring-4 focus:ring-blue-300"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Admin Login Modal */}
            {showAdminLoginModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-200">
                        <h3 className="text-2xl font-bold mb-6 text-gray-800 text-center">Administrator Login</h3>
                        <form onSubmit={handleAdminLogin} className="space-y-4">
                            <div>
                                <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700 mb-2">Password:</label>
                                <input
                                    type="password"
                                    id="adminPassword"
                                    value={adminPasswordInput}
                                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                                    className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"
                                    required
                                />
                                {adminLoginError && <p className="text-red-600 text-sm mt-2">{adminLoginError}</p>}
                            </div>
                            <div className="flex justify-end space-x-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowAdminLoginModal(false)}
                                    className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                                >
                                    Login
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {/* Manage Stock Modal */}
            {showManageStockModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <h2 className="text-3xl font-bold text-gray-900 mb-8 border-b-2 pb-4 border-gray-200 text-center">Manage Stock</h2>

                        {/* Tabs for Add New Stocks / Multiple Restocking */}
                        <div className="flex border-b border-gray-300 mb-8">
                            <button
                                onClick={() => setActiveManageStockTab('add-new-stocks')}
                                className={`flex-1 py-4 text-center text-xl font-semibold rounded-t-lg transition duration-200 ease-in-out
                                    ${activeManageStockTab === 'add-new-stocks' ? 'tab-button active text-blue-700 border-blue-700' : 'text-gray-600 hover:text-gray-800 hover:border-gray-400 border-transparent'}`}
                            >
                                Add New Items
                            </button>
                            <button
                                onClick={() => setActiveManageStockTab('multiple-restocking')}
                                className={`flex-1 py-4 text-center text-xl font-semibold rounded-t-lg transition duration-200 ease-in-out
                                    ${activeManageStockTab === 'multiple-restocking' ? 'tab-button active text-blue-700 border-blue-700' : 'text-gray-600 hover:text-gray-800 hover:border-gray-400 border-transparent'}`}
                            >
                                Multiple Restock
                            </button>
                        </div>

                        {/* Add New Stocks Tab Content */}
                        {activeManageStockTab === 'add-new-stocks' && (
                            <form onSubmit={handleAddNewItem} className="space-y-6">
                                <div>
                                    <label htmlFor="itemName" className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                                    <input type="text" id="itemName" name="itemName" required
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                </div>
                                <div>
                                    <label htmlFor="itemDescription" className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                    <textarea id="itemDescription" name="itemDescription" rows="3"
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"></textarea>
                                </div>
                                <div>
                                    <label htmlFor="itemBrand" className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                                    <input type="text" id="itemBrand" name="itemBrand" required
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label htmlFor="itemStock" className="block text-sm font-medium text-gray-700 mb-2">Stock Quantity</label>
                                        <input type="number" id="itemStock" name="itemStock" required min="0"
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                    </div>
                                    <div>
                                        <label htmlFor="itemCostPrice" className="block text-sm font-medium text-gray-700 mb-2">Cost Price (₱)</label>
                                        <input type="number" id="itemCostPrice" name="itemCostPrice" step="0.01" required min="0"
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                    </div>
                                    <div>
                                        <label htmlFor="itemSellingPrice" className="block text-sm font-medium text-gray-700 mb-2">Selling Price (₱)</label>
                                        <input type="number" id="itemSellingPrice" name="itemSellingPrice" step="0.01" required min="0"
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="itemReorderLevel" className="block text-sm font-medium text-gray-700 mb-2">Reorder Level</label>
                                    <input type="number" id="itemReorderLevel" name="itemReorderLevel" required min="0"
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                </div>
                                <div className="flex justify-end space-x-4 mt-8">
                                    <button
                                        type="button"
                                        onClick={() => setShowManageStockModal(false)}
                                        className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-3 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition duration-300 font-bold text-lg"
                                    >
                                        Add New Item
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Multiple Restocking Tab Content */}
                        {activeManageStockTab === 'multiple-restocking' && (
                            <div>
                                <input
                                    type="text"
                                    placeholder="Search by name or SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm mb-6 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"
                                />
                                <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container mb-6">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Current Stock</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quantity to Add</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredRestockItems.length > 0 ? (
                                                filteredRestockItems.map((item) => (
                                                    <tr key={item.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.sku}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.stock}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={tempRestockQuantities[item.id] || ''}
                                                                onChange={(e) => handleTempRestockQuantityChange(item.id, e.target.value)}
                                                                className="w-24 px-3 py-2 border border-gray-300 rounded-md text-base"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button
                                                                onClick={() => handleAddToRestockCart(item)}
                                                                className="text-blue-600 hover:text-blue-800 font-semibold"
                                                            >
                                                                Add to List
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="5" className="px-6 py-4 text-center text-base text-gray-500">No items found or loaded.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <h3 className="text-xl font-bold text-gray-800 mb-4">Items to Restock</h3>
                                {restockCart.length === 0 ? (
                                    <p className="text-gray-600 text-base">No items selected for restocking.</p>
                                ) : (
                                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container mb-6">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-100 sticky top-0">
                                                <tr>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Current Stock</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quantity to Restock</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {restockCart.map((item) => (
                                                    <tr key={item.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.sku}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.currentStock}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.quantityToRestock}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button
                                                                onClick={() => handleRemoveFromRestockCart(item.id)}
                                                                className="text-red-600 hover:text-red-800 font-semibold"
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div className="flex justify-end space-x-4 mt-8">
                                    <button
                                        type="button"
                                        onClick={() => setShowManageStockModal(false)}
                                        className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRestockMultipleItems}
                                        disabled={restockCart.length === 0}
                                        className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-300 font-bold text-lg"
                                    >
                                        Confirm Restock
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* View Inventory Modal */}
            {showViewInventoryModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <h2 className="text-3xl font-bold text-gray-900 mb-8 border-b-2 pb-4 border-gray-200 text-center">Current Inventory Overview</h2>
                        <input
                            type="text"
                            placeholder="Search inventory by name, SKU, or brand..."
                            value={viewInventorySearchQuery}
                            onChange={(e) => setViewInventorySearchQuery(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm mb-6 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"
                        />
                        <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Brand</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Stock</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Cost Price</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Selling Price</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Reorder Level</th>
                                        {isAdminMode && <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredInventoryItems.length > 0 ? (
                                        filteredInventoryItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.sku}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.brand}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.stock}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.costPrice?.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.sellingPrice?.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.reorderLevel}</td>
                                                {isAdminMode && (
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                        <button
                                                            onClick={() => handleEditItemClick(item)}
                                                            className="text-indigo-600 hover:text-indigo-900 mr-4 font-semibold"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveItemClick(item)}
                                                            className="text-red-600 hover:text-red-900 font-semibold"
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={isAdminMode ? "8" : "7"} className="px-6 py-4 text-center text-base text-gray-500">No inventory items found matching your search.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end mt-8">
                            <button
                                onClick={() => setShowViewInventoryModal(false)}
                                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Item Modal */}
            {showEditItemModal && selectedItemToEdit && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <h2 className="text-3xl font-bold text-gray-900 mb-8 border-b-2 pb-4 border-gray-200 text-center">Edit Item: {selectedItemToEdit.name}</h2>
                        <form onSubmit={handleUpdateItem} className="space-y-6">
                            <div>
                                <label htmlFor="editItemName" className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                                <input type="text" id="editItemName" name="itemName" required
                                    defaultValue={selectedItemToEdit.name}
                                    className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                            </div>
                            <div>
                                <label htmlFor="editItemDescription" className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea id="editItemDescription" name="itemDescription" rows="3"
                                    defaultValue={selectedItemToEdit.description}
                                    className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"></textarea>
                            </div>
                            <div>
                                <label htmlFor="editItemBrand" className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                                <input type="text" id="editItemBrand" name="itemBrand" required
                                    defaultValue={selectedItemToEdit.brand}
                                    className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label htmlFor="editItemStock" className="block text-sm font-medium text-gray-700 mb-2">Stock Quantity</label>
                                    <input type="number" id="editItemStock" name="itemStock" required min="0"
                                        defaultValue={selectedItemToEdit.stock}
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                </div>
                                <div>
                                    <label htmlFor="editItemCostPrice" className="block text-sm font-medium text-gray-700 mb-2">Cost Price (₱)</label>
                                    <input type="number" id="editItemCostPrice" name="itemCostPrice" step="0.01" required min="0"
                                        defaultValue={selectedItemToEdit.costPrice}
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                </div>
                                <div>
                                    <label htmlFor="editItemSellingPrice" className="block text-sm font-medium text-gray-700 mb-2">Selling Price (₱)</label>
                                    <input type="number" id="editItemSellingPrice" name="itemSellingPrice" step="0.01" required min="0"
                                        defaultValue={selectedItemToEdit.sellingPrice}
                                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="editItemReorderLevel" className="block text-sm font-medium text-gray-700 mb-2">Reorder Level</label>
                                <input type="number" id="editItemReorderLevel" name="itemReorderLevel" required min="0"
                                    defaultValue={selectedItemToEdit.reorderLevel}
                                    className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                            </div>
                            <div className="flex justify-end space-x-4 mt-8">
                                <button
                                    type="button"
                                    onClick={() => setShowEditItemModal(false)}
                                    className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition duration-300 font-bold text-lg"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Delete Modal */}
            {showConfirmDeleteModal && itemToDelete && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-200">
                        <h3 className="text-2xl font-bold mb-4 text-gray-800 text-center">Confirm Deletion</h3>
                        <p className="text-gray-700 text-lg mb-6 text-center">Are you sure you want to remove "<span className="font-semibold">{itemToDelete.name}</span>" (SKU: {itemToDelete.sku}) from the inventory?</p>
                        <div className="flex justify-end space-x-4 pt-4">
                            <button
                                type="button"
                                onClick={() => setShowConfirmDeleteModal(false)}
                                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmRemoveItem}
                                className="px-6 py-3 bg-red-700 hover:bg-red-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Confirm Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Low Stock Notification Modal */}
            {showLowStockModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <div ref={lowStockRef} className="modal-to-print">
                            <h2 className="text-3xl font-bold text-red-700 mb-8 border-b-2 pb-4 border-gray-200 text-center">Low Stock Alerts</h2>
                            {lowStockItems.length === 0 ? (
                                <p className="text-gray-600 text-lg text-center">No items are currently low on stock. Inventory is healthy!</p>
                            ) : (
                                <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container mb-6">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Current Stock</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Reorder Level</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {lowStockItems.map((item) => (
                                                <tr key={item.id} className="bg-red-50 hover:bg-red-100">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-800">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700">{item.sku}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700">{item.stock}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700">{item.reorderLevel}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end space-x-4 mt-8 print-hidden">
                            <button
                                onClick={() => setShowLowStockModal(false)}
                                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintContent(lowStockRef, 'Low Stock Report')}
                                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Print Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Sale Modal */}
            {showNewSaleModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <h2 className="text-3xl font-bold text-gray-900 mb-8 border-b-2 pb-4 border-gray-200 text-center">New Sales Transaction</h2>

                        <form onSubmit={handleConfirmSale}>
                            {/* Customer Information */}
                            <div className="mb-8 border border-gray-200 rounded-xl p-6 bg-gray-50">
                                <h3 className="text-xl font-bold text-gray-800 mb-5">Customer Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-2">Customer Name</label>
                                        <input type="text" id="customerName" name="customerName" required
                                            value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                    </div>
                                    <div>
                                        <label htmlFor="customerContact" className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
                                        <input type="text" id="customerContact" name="customerContact" required
                                            value={customerContact} onChange={(e) => setCustomerContact(e.target.value)}
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label htmlFor="customerAddress" className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                                        <textarea id="customerAddress" name="customerAddress" rows="2" required
                                            value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"></textarea>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-700 mb-2">Email (Optional)</label>
                                        <input type="email" id="customerEmail" name="customerEmail"
                                            value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base" />
                                    </div>
                                </div>
                            </div>

                            {/* Add Products to Cart */}
                            <div className="mb-8 border border-gray-200 rounded-xl p-6 bg-gray-50">
                                <h3 className="text-xl font-bold text-gray-800 mb-5">Products Selection</h3>
                                <input
                                    type="text"
                                    placeholder="Search product by name or SKU..."
                                    value={saleSearchQuery}
                                    onChange={(e) => setSaleSearchQuery(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm mb-6 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"
                                />

                                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container mb-6">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Product Name</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Price</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Stock</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Qty</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Add</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {inventoryItems.filter(item =>
                                                (item.name?.toLowerCase().includes(saleSearchQuery.toLowerCase()) ||
                                                item.sku?.toLowerCase().includes(saleSearchQuery.toLowerCase()))
                                            ).map((item) => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.sku}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.sellingPrice?.toLocaleString()}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.stock}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={item.stock}
                                                            value={item.quantityInSale || ''}
                                                            onChange={(e) => handleQuantityChangeInSaleInput(item.id, e.target.value)}
                                                            className="w-24 px-3 py-2 border border-gray-300 rounded-md text-base"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddProductToPurchaseCart(item)}
                                                            className="text-blue-600 hover:text-blue-800 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                            disabled={item.stock === 0 || !item.quantityInSale || parseInt(item.quantityInSale) <= 0}
                                                        >
                                                            Add
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Purchase Cart Summary */}
                            <div className="mb-8 border border-gray-200 rounded-xl p-6 bg-gray-50">
                                <h3 className="text-xl font-bold text-gray-800 mb-5">Purchase Cart Summary</h3>
                                {purchaseCart.length === 0 ? (
                                    <p className="text-gray-600 text-base">No items in cart.</p>
                                ) : (
                                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-100 sticky top-0">
                                                <tr>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Qty</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Price</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {purchaseCart.map((item) => (
                                                    <tr key={item.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.quantity}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.price?.toLocaleString()}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.total?.toLocaleString()}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveFromPurchaseCart(item.id)}
                                                                className="text-red-600 hover:text-red-800 font-semibold"
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-100">
                                                    <td colSpan="3" className="px-6 py-4 text-right text-base font-bold text-gray-900">Grand Total:</td>
                                                    <td colSpan="2" className="px-6 py-4 whitespace-nowrap text-base font-bold text-gray-900">₱{calculatePurchaseTotal().toLocaleString()}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end space-x-4 mt-8">
                                <button
                                    type="button"
                                    onClick={() => setShowNewSaleModal(false)}
                                    className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={purchaseCart.length === 0}
                                    className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-300 font-bold text-lg"
                                >
                                    Confirm Sale
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Sales Invoice Modal */}
            {showInvoiceModal && invoiceData && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <div ref={invoiceRef} className="modal-to-print">
                            <h2 className="text-3xl font-bold text-center text-gray-900 mb-8 border-b-2 pb-4 border-gray-200">Sales Invoice</h2>
                            <div className="mb-6 text-gray-800 text-lg">
                                <p className="mb-2"><span className="font-semibold">Invoice ID:</span> {invoiceData.id}</p>
                                <p className="mb-2"><span className="font-semibold">Date:</span> {invoiceData.timestamp}</p>
                            </div>

                            <div className="mb-8 p-6 border rounded-xl bg-gray-50 shadow-sm">
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Customer Information:</h3>
                                <p className="text-gray-700"><strong>Name:</strong> {invoiceData.customerName}</p>
                                <p className="text-gray-700"><strong>Address:</strong> {invoiceData.customerAddress}</p>
                                <p className="text-gray-700"><strong>Contact:</strong> {invoiceData.customerContact}</p>
                                {invoiceData.customerEmail && <p className="text-gray-700"><strong>Email:</strong> {invoiceData.customerEmail}</p>}
                            </div>

                            <h3 className="text-xl font-bold text-gray-800 mb-4">Items Purchased:</h3>
                            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container mb-8">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quantity</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Price (₱)</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total (₱)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {invoiceData.items.map((item, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.quantity}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.price?.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.total?.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 total-row">
                                            <td colSpan="3" className="px-6 py-4 text-right text-base font-bold text-gray-900">Grand Total:</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-base font-bold text-gray-900">₱{invoiceData.totalAmount?.toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-center text-base text-gray-700 mt-8">Thank you for your business!</p>
                        </div>

                        <div className="flex justify-end space-x-4 mt-8 print-hidden">
                            <button
                                onClick={() => setShowInvoiceModal(false)}
                                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintContent(invoiceRef, `Invoice - ${invoiceData.id}`)}
                                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Print Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Recent Sales Modal */}
            {showRecentSalesModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <div ref={recentSalesRef} className="modal-to-print">
                            <h2 className="text-3xl font-bold text-gray-900 mb-8 border-b-2 pb-4 border-gray-200 text-center">Recent Sales History</h2>
                            {recentSalesData.length === 0 ? (
                                <p className="text-gray-600 text-lg text-center">No recent sales to display.</p>
                            ) : (
                                <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Sale ID</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Customer Name</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Amount</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Date</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider print-hidden">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {recentSalesData.map((sale) => (
                                                <tr key={sale.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sale.id}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{sale.customerName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{sale.totalAmount?.toLocaleString()}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                        {sale.timestamp ? new Date(sale.timestamp.seconds * 1000).toLocaleString() : 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium print-hidden">
                                                        <button
                                                            onClick={() => handleViewSaleSummary(sale)}
                                                            className="text-blue-600 hover:text-blue-800 font-semibold mr-3"
                                                        >
                                                            View Details
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end space-x-4 mt-8 print-hidden">
                            <button
                                onClick={() => setShowRecentSalesModal(false)}
                                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintContent(recentSalesRef, 'Recent Sales Report')}
                                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Print Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sale Summary Modal (triggered from Recent Sales) */}
            {showSaleSummaryModal && selectedSaleSummary && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <div ref={saleSummaryRef} className="modal-to-print">
                            <h2 className="text-3xl font-bold text-center text-gray-900 mb-8 border-b-2 pb-4 border-gray-200">Sale Transaction Summary</h2>
                            <div className="mb-6 text-gray-800 text-lg">
                                <p className="mb-2"><span className="font-semibold">Sale ID:</span> {selectedSaleSummary.id}</p>
                                <p className="mb-2"><span className="font-semibold">Date:</span> {selectedSaleSummary.timestamp ? new Date(selectedSaleSummary.timestamp.seconds * 1000).toLocaleString() : 'N/A'}</p>
                            </div>

                            <div className="mb-8 p-6 border rounded-xl bg-gray-50 shadow-sm">
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Customer Information:</h3>
                                <p className="text-gray-700"><strong>Name:</strong> {selectedSaleSummary.customerName}</p>
                                <p className="text-gray-700"><strong>Address:</strong> {selectedSaleSummary.customerAddress}</p>
                                <p className="text-gray-700"><strong>Contact:</strong> {selectedSaleSummary.customerContact}</p>
                                {selectedSaleSummary.customerEmail && <p className="text-gray-700"><strong>Email:</strong> {selectedSaleSummary.customerEmail}</p>}
                            </div>

                            <h3 className="text-xl font-bold text-gray-800 mb-4">Items Sold:</h3>
                            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container mb-8">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item Name</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quantity</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Price (₱)</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total (₱)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {selectedSaleSummary.items && selectedSaleSummary.items.length > 0 ? (
                                            selectedSaleSummary.items.map((item, index) => (
                                                <tr key={index} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.itemName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.sku}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.quantitySold}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.sellingPriceAtSale?.toLocaleString()}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₱{item.total?.toLocaleString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="px-6 py-4 text-center text-base text-gray-500">No items recorded for this sale.</td>
                                            </tr>
                                        )}
                                        <tr className="bg-gray-100 total-row">
                                            <td colSpan="4" className="px-6 py-4 text-right text-base font-bold text-gray-900">Grand Total:</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-base font-bold text-gray-900">₱{selectedSaleSummary.totalAmount?.toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-4 mt-8 print-hidden">
                            <button
                                onClick={() => setShowSaleSummaryModal(false)}
                                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintContent(saleSummaryRef, `Sale Summary - ${selectedSaleSummary.id}`)}
                                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Print Summary
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Activity Logs Modal */}
            {showActivityLogsModal && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-70 flex items-center justify-center z-50 p-4 modal-overlay backdrop-blur-sm">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-200">
                        <div ref={activityLogsRef} className="modal-to-print">
                            <h2 className="text-3xl font-bold text-gray-900 mb-8 border-b-2 pb-4 border-gray-200 text-center">Activity Logs</h2>
                            {activityLogsData.length === 0 ? (
                                <p className="text-gray-600 text-lg text-center">No activity logs to display.</p>
                            ) : (
                                <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg shadow-inner table-container">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Timestamp</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Activity Type</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Description</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {activityLogsData.map((log) => (
                                                <tr key={log.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                        {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{log.type}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-700">{log.description}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end space-x-4 mt-8 print-hidden">
                            <button
                                onClick={() => setShowActivityLogsModal(false)}
                                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-300 font-semibold text-lg"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintContent(activityLogsRef, 'Activity Logs Report')}
                                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition duration-300 font-bold text-lg"
                            >
                                Print Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
