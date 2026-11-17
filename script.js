// ==========================================
// VENDORA BUSINESS MANAGEMENT APPLICATION
// CORRECTED VERSION
// PART 1: CONFIGURATION, STATE & HELPERS
// ==========================================

// SUPABASE CONFIGURATION
const SUPABASE_URL = "https://pfhvakrxiwqzutnrhhug.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_RKACRnEeV8ym6T8BOuxuUA_Ox3dtilG";

// Use a unique client variable to avoid the
// "Identifier 'supabase' has already been declared" error.
const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// ==========================================
// APPLICATION STATE
// ==========================================

let currentUser = null;
let currentBusiness = null;

let products = [];
let customers = [];
let sales = [];
let expenses = [];

let cloudReady = false;

// ==========================================
// GENERAL HELPERS
// ==========================================

function $(id) {
    return document.getElementById(id);
}

function formatMoney(amount) {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatDate(date) {
    if (!date) return "";

    return new Date(date).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(date) {
    if (!date) return "";

    return new Date(date).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function showAlert(message) {
    alert(message);
}

function showAuthMessage(message, type = "error") {
    const box = $("authMessage");

    if (!box) return;

    box.textContent = message;
    box.style.display = "block";
    box.style.color =
        type === "success" ? "#059669" : "#dc2626";
}

function clearAuthMessage() {
    const box = $("authMessage");

    if (box) {
        box.textContent = "";
        box.style.display = "none";
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

// ==========================================
// CLOUD DATA LOADING
// ==========================================

async function loadAllCloudData() {
    if (!currentBusiness) return;

    try {
        const businessId = currentBusiness.id;

        const [
            productsResult,
            customersResult,
            salesResult,
            expensesResult
        ] = await Promise.all([

            db.from("products")
                .select("*")
                .eq("business_id", businessId)
                .order("created_at", { ascending: false }),

            db.from("customers")
                .select("*")
                .eq("business_id", businessId)
                .order("created_at", { ascending: false }),

            db.from("sales")
                .select("*, sale_items(*)")
                .eq("business_id", businessId)
                .order("created_at", { ascending: false }),

            db.from("expenses")
                .select("*")
                .eq("business_id", businessId)
                .order("created_at", { ascending: false })
        ]);

        if (productsResult.error) throw productsResult.error;
        if (customersResult.error) throw customersResult.error;
        if (salesResult.error) throw salesResult.error;
        if (expensesResult.error) throw expensesResult.error;

        products = productsResult.data || [];
        console.log("Vendora products:", products);
        customers = customersResult.data || [];
        sales = salesResult.data || [];
        expenses = expensesResult.data || [];

        cloudReady = true;

        refreshDashboard();

    } catch (error) {
        console.error("Cloud loading error:", error);

        cloudReady = false;

        showAlert(
            "Unable to load business data. Check your internet connection and try again."
        );
    }
}

// ==========================================
// BUSINESS PROFILE
// ==========================================

async function loadBusinessProfile() {
    if (!currentUser) return null;

    try {
        const { data, error } = await db
            .from("businesses")
            .select("*")
            .eq("owner_id", currentUser.id)
            .maybeSingle();

        if (error) throw error;

        currentBusiness = data;

        return data;

    } catch (error) {
        console.error("Business profile error:", error);
        return null;
    }
}

async function saveBusinessProfile(event) {
    if (event) event.preventDefault();

    if (!currentBusiness) {
        showAlert("Business profile not found.");
        return;
    }

    const businessName = $("businessName")?.value.trim();
    const phone = $("businessPhone")?.value.trim();
    const address = $("businessAddress")?.value.trim();

    if (!businessName) {
        showAlert("Please enter your business name.");
        return;
    }

    try {
        const { data, error } = await db
            .from("businesses")
            .update({
                business_name: businessName,
                phone,
                address
            })
            .eq("id", currentBusiness.id)
            .select()
            .single();

        if (error) throw error;

        currentBusiness = data;

        updateBusinessDisplay();

        showAlert("Business profile updated successfully.");

    } catch (error) {
        console.error("Profile update error:", error);
        showAlert("Unable to update your business profile.");
    }
}

function updateBusinessDisplay() {
    if (!currentBusiness) return;

    if ($("businessNameDisplay")) {
        $("businessNameDisplay").textContent =
            currentBusiness.business_name || "My Business";
    }

    if ($("businessName")) {
        $("businessName").value =
            currentBusiness.business_name || "";
    }

    if ($("businessPhone")) {
        $("businessPhone").value =
            currentBusiness.phone || "";
    }

    if ($("businessAddress")) {
        $("businessAddress").value =
            currentBusiness.address || "";
    }
}

// ==========================================
// LOGOUT BUTTON
// ==========================================

function ensureLogoutButton() {
    if ($("logoutButton")) return;

    const accountScreen = $("accountScreen");

    if (!accountScreen) return;

    const button = document.createElement("button");

    button.id = "logoutButton";
    button.type = "button";
    button.textContent = "Log Out";

    button.style.cssText = `
        width: 100%;
        padding: 14px;
        margin-top: 20px;
        border: none;
        border-radius: 10px;
        background: #fee2e2;
        color: #dc2626;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
    `;

    button.onclick = logoutUser;

    accountScreen.appendChild(button);
}
// ==========================================
// PART 2: SCREEN NAVIGATION
// ==========================================

function hideAllScreens() {
    const screens = [
        "dashboardScreen",
        "newSaleScreen",
        "salesHistoryScreen",
        "productsScreen",
        "customersScreen",
        "expensesScreen",
        "accountScreen"
    ];

    screens.forEach(id => {
        const screen = $(id);
        if (screen) screen.hidden = true;
    });
}

function showScreen(screenId) {
    hideAllScreens();

    const screen = $(screenId);

    if (!screen) {
        console.warn("Screen not found:", screenId);
        return;
    }

    screen.hidden = false;

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function goHome() {
    showScreen("dashboardScreen");
    refreshDashboard();
}

function showMessage(section) {
const actions = {
"Sales": () => openSalesHistory(),
"Products": () => openProducts(),
"Customers": () => openCustomers(),
"Expenses": () => openExpenses(),
"Account": () => openAccount(),
"New Sale": () => openNewSale(),
"Add Product": () => openAddProduct(),
"Add Customer": () => openAddCustomer(),
"View Reports": () => openReports()
};

if (actions[section]) {
    actions[section]();
} else {
    showAlert(section + " section is not available.");
}

}

function openNewSale() {
    showScreen("newSaleScreen");
    populateSaleProducts();
}

function openSalesHistory() {
    showScreen("salesHistoryScreen");
    renderSalesHistory();
}

function openProducts() {
    showScreen("productsScreen");
    renderProducts();
}

function openCustomers() {
    showScreen("customersScreen");
    renderCustomers();
}

function openExpenses() {
    showScreen("expensesScreen");
    renderExpenses();
}

function openAccount() {
    showScreen("accountScreen");
    updateBusinessDisplay();
}

// Close buttons used by the HTML
function closeSaleScreen() {
    goHome();
}

function closeSalesScreen() {
    goHome();
}

function closeProductsScreen() {
    goHome();
}

function closeCustomersScreen() {
    goHome();
}

function closeExpensesScreen() {
    goHome();
}

// ==========================================
// QUICK ACTIONS
// ==========================================

function openAddProduct() {
    const name = prompt("Enter product name:");
    if (name === null) return;

    const price = prompt("Enter product price:");
    if (price === null) return;

    const stock = prompt("Enter available quantity:");
    if (stock === null) return;

    addProduct(name, price, stock);
}

function openAddCustomer() {
    const name = prompt("Enter customer name:");
    if (name === null) return;

    const phone = prompt("Enter customer phone number:");
    if (phone === null) return;

    addCustomer(name, phone);
}

function openReports() {
    const revenue = sales.reduce(
        (sum, sale) => sum + Number(sale.total || 0), 0
    );

    const totalExpenses = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    showAlert(
        "BUSINESS SUMMARY\n\n" +
        "Total Revenue: " + formatMoney(revenue) + "\n" +
        "Total Expenses: " + formatMoney(totalExpenses) + "\n" +
        "Net Balance: " + formatMoney(revenue - totalExpenses) + "\n" +
        "Total Sales: " + sales.length + "\n" +
        "Total Products: " + products.length + "\n" +
        "Total Customers: " + customers.length
    );
}

// ==========================================
// DASHBOARD
// ==========================================

function refreshDashboard() {
    const totalRevenue = sales.reduce(
        (sum, sale) => sum + Number(sale.total || 0), 0
    );

    const totalExpenses = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    if ($("dashboardRevenue")) {
        $("dashboardRevenue").textContent =
            formatMoney(totalRevenue);
    }

    if ($("dashboardSales")) {
        $("dashboardSales").textContent = sales.length;
    }

    if ($("dashboardExpenses")) {
        $("dashboardExpenses").textContent =
            formatMoney(totalExpenses);
    }

    if ($("dashboardProducts")) {
        $("dashboardProducts").textContent = products.length;
    }

    if ($("dashboardCustomers")) {
        $("dashboardCustomers").textContent = customers.length;
    }

    renderRecentTransactions();
}

function renderRecentTransactions() {
    const container = $("recentTransactions");
    if (!container) return;
    
    if (sales.length === 0) {
        container.innerHTML = "<p>No transactions yet.</p>";
        return;
    }
    
    container.innerHTML = sales.slice(0, 5).map(sale => `
    <div class="transaction-item">
        <div>
            <strong>${escapeHTML(sale.customer_name || "Walk-in Customer")}</strong>
            <small>${formatDateTime(sale.created_at)}</small>
            <strong>${formatMoney(sale.total)}</strong>
        </div>

        <button type="button"
            onclick="viewSaleReceipt('${sale.id}')">
            🧾 View Receipt
        </button>
    </div>
`).join("");
    
}

// ==========================================
// DASHBOARD QUICK BUTTONS
// ==========================================

function openNewSaleScreen() {
    openNewSale();
}

function openProductsScreen() {
    openProducts();
}

function openCustomersScreen() {
    openCustomers();
}

function openExpensesScreen() {
    openExpenses();
}

function openAccountScreen() {
    openAccount();
}
// ==========================================
// PART 3: SALES MANAGEMENT
// ==========================================

function populateSaleProducts() {
    const select = $("saleProduct");

    if (!select) return;

    select.innerHTML = '<option value="">Select a product</option>';

    products.forEach(product => {
        select.innerHTML += `
            <option value="${product.id}">
                ${escapeHTML(product.name)} — ${formatMoney(product.price)}
                (Stock: ${Number(product.stock || 0)})
            </option>
        `;
    });

    updateSaleTotal();
}

function updateSaleTotal() {
const productId = $("saleProduct")?.value;
const quantity = Number($("saleQuantity")?.value || 0);

const product = products.find(
    item => String(item.id) === String(productId)
);

const totalElement = $("saleTotal");

if (!product) {
    if (totalElement) {
        totalElement.textContent = formatMoney(0);
    }

    if ($("availableStock")) {
        $("availableStock").textContent = "Available stock: 0";
    }

    return;
}

const stock = Number(product.stock || 0);
const price = Number(product.price || 0);
const total = price * quantity;

if (totalElement) {
    totalElement.textContent = formatMoney(total);
}

if ($("availableStock")) {
    $("availableStock").textContent =
        "Available stock: " + stock;
}

}

async function recordSale(event) {
    if (event) event.preventDefault();

    if (!currentBusiness || !cloudReady) {
        showAlert("Please log in and wait for your business data to load.");
        return;
    }

    const productId = $("saleProduct")?.value;
    const quantity = Number($("saleQuantity")?.value || 0);
    const customerName =
        $("saleCustomer")?.value.trim() || "Walk-in Customer";

    const product = products.find(
        item => String(item.id) === String(productId)
    );

    if (!product) {
        showAlert("Please select a product.");
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        showAlert("Enter a valid quantity.");
        return;
    }

    if (quantity > Number(product.stock || 0)) {
        showAlert("Not enough stock available.");
        return;
    }

    const unitPrice = Number(product.price || 0);
    const total = unitPrice * quantity;

    try {
        const { data: sale, error: saleError } = await db
            .from("sales")
            .insert({
                business_id: currentBusiness.id,
                customer_name: customerName,
                total
            })
            .select()
            .single();

        if (saleError) throw saleError;

        const { error: itemError } = await db
            .from("sale_items")
            .insert({
                sale_id: sale.id,
                product_id: product.id,
                product_name: product.name,
                unit_price: unitPrice,
                quantity,
                line_total: total
            });

        if (itemError) {
            await db.from("sales").delete().eq("id", sale.id);
            throw itemError;
        }

        const { error: stockError } = await db
            .from("products")
            .update({
                stock: Number(product.stock) - quantity
            })
            .eq("id", product.id)
            .eq("business_id", currentBusiness.id);

        if (stockError) throw stockError;

        await loadAllCloudData();

$("saleForm")?.reset();
populateSaleProducts();

showReceipt({
id: sale.id,
customer: customerName,
product: product.name,
quantity: quantity,
price: unitPrice,
total: total,
date: sale.created_at
});

goHome();

    } catch (error) {
        console.error("Sale error:", error);
        showAlert("Unable to record sale: " + (error.message || "Please try again."));
        await loadAllCloudData();
    }
}

function renderSalesHistory(searchTerm = "") {
    const container = $("salesHistoryList");
    if (!container) return;
    
    const search = searchTerm.toLowerCase();
    
    const filtered = sales.filter(sale =>
        String(sale.customer_name || "").toLowerCase().includes(search)
    );
    
    const totalRevenue = sales.reduce(
        (sum, sale) => sum + Number(sale.total || 0), 0
    );
    
    if ($("historyTotalRevenue")) {
        $("historyTotalRevenue").textContent = formatMoney(totalRevenue);
    }
    
    if ($("historyTotalTransactions")) {
        $("historyTotalTransactions").textContent = sales.length;
    }
    
    if (filtered.length === 0) {
        container.innerHTML = "<p>No sales found.</p>";
        return;
    }
    
    container.innerHTML = filtered.map(sale => `
    <div class="transaction-item">
        <div>
            <strong>${escapeHTML(sale.customer_name || "Walk-in Customer")}</strong>
            <small>${formatDateTime(sale.created_at)}</small>
            <strong>${formatMoney(sale.total)}</strong>
        </div>

        <div class="transaction-actions">
            <button type="button"
                onclick="viewSaleReceipt('${sale.id}')">
                View Receipt
            </button>

            <button type="button"
                onclick="reprintSaleReceipt('${sale.id}')">
                Reprint
            </button>

            <button type="button"
                onclick="downloadSaleReceipt('${sale.id}')">
                Download
            </button>
        </div>
    </div>
`).join("");
    
}

function filterSalesHistory() {
    renderSalesHistory($("salesSearch")?.value || "");
}
// ==========================================
// PART 4: PRODUCT MANAGEMENT
// ==========================================

async function addProduct(name, price, stock) {
    if (!currentBusiness || !cloudReady) {
        showAlert("Please log in before adding products.");
        return;
    }

    name = String(name || "").trim();
    price = Number(price);
    stock = Number(stock);

    if (!name || !Number.isFinite(price) || price <= 0 ||
        !Number.isInteger(stock) || stock < 0) {
        showAlert("Enter a valid product name, price and stock quantity.");
        return;
    }

    try {
        const { error } = await db
            .from("products")
            .insert({
                business_id: currentBusiness.id,
                name,
                price,
                stock
            });

        if (error) throw error;

        await loadAllCloudData();
        renderProducts();

        showAlert("Product added successfully!");

    } catch (error) {
        console.error("Add product error:", error);
        showAlert("Unable to add product: " + (error.message || "Please try again."));
    }
}

async function deleteProduct(productId) {
    if (!confirm("Are you sure you want to delete this product?")) {
        return;
    }

    try {
        const { error } = await db
            .from("products")
            .delete()
            .eq("id", productId)
            .eq("business_id", currentBusiness.id);

        if (error) throw error;

        await loadAllCloudData();
        renderProducts();

        showAlert("Product deleted.");

    } catch (error) {
        console.error("Delete product error:", error);
        showAlert("Unable to delete product.");
    }
}

function renderProducts(searchTerm = "") {
    const container = $("productsList");
    if (!container) return;
    
    const search = searchTerm.toLowerCase();
    
    const filtered = products.filter(product =>
        String(product.name || "").toLowerCase().includes(search)
    );
    
    const lowStock = products.filter(product =>
        Number(product.stock || 0) > 0 &&
        Number(product.stock || 0) <= 5
    ).length;
    
    const outOfStock = products.filter(product =>
        Number(product.stock || 0) === 0
    ).length;
    
    const totalUnits = products.reduce(
        (sum, product) => sum + Number(product.stock || 0), 0
    );
    
    if ($("inventoryTotalProducts"))
        $("inventoryTotalProducts").textContent = products.length;
    
    if ($("inventoryLowStock"))
        $("inventoryLowStock").textContent = lowStock;
    
    if ($("inventoryOutOfStock"))
        $("inventoryOutOfStock").textContent = outOfStock;
    
    if ($("inventoryTotalUnits"))
        $("inventoryTotalUnits").textContent = totalUnits;
    
    if (filtered.length === 0) {
        container.innerHTML = "<p>No products found.</p>";
        return;
    }
    
    container.innerHTML = filtered.map(product => `
    <div class="product-item">
        <div>
            <strong>${escapeHTML(product.name)}</strong>
            <small>
                ${formatMoney(product.price)}
                · Stock: ${Number(product.stock || 0)}
            </small>
        </div>

        <div class="product-actions">
            <button type="button"
                onclick="editProduct('${product.id}')">
                Edit
            </button>

            <button type="button"
                onclick="deleteProduct('${product.id}')">
                Delete
            </button>
        </div>
    </div>
`).join("");
    
}

function filterProducts() {
    renderProducts($("productSearch")?.value || "");
}

// ==========================================
// PART 4B: CUSTOMER MANAGEMENT
// ==========================================

async function addCustomer(name, phone) {
    if (!currentBusiness || !cloudReady) {
        showAlert("Please log in before adding customers.");
        return;
    }

    name = String(name || "").trim();
    phone = String(phone || "").trim();

    if (!name) {
        showAlert("Enter the customer's name.");
        return;
    }

    try {
        const { error } = await db
            .from("customers")
            .insert({
                business_id: currentBusiness.id,
                name,
                phone
            });

        if (error) throw error;

        await loadAllCloudData();
        renderCustomers();

        showAlert("Customer added successfully!");

    } catch (error) {
        console.error("Add customer error:", error);
        showAlert("Unable to add customer.");
    }
}

async function deleteCustomer(customerId) {
    if (!confirm("Are you sure you want to delete this customer?")) {
        return;
    }

    try {
        const { error } = await db
            .from("customers")
            .delete()
            .eq("id", customerId)
            .eq("business_id", currentBusiness.id);

        if (error) throw error;

        await loadAllCloudData();
        renderCustomers();

        showAlert("Customer deleted.");

    } catch (error) {
        console.error("Delete customer error:", error);
        showAlert("Unable to delete customer.");
    }
}

function renderCustomers(searchTerm = "") {
    const container = $("customersList");
    if (!container) return;

    const search = searchTerm.toLowerCase();

    const filtered = customers.filter(customer =>
        String(customer.name || "").toLowerCase().includes(search) ||
        String(customer.phone || "").toLowerCase().includes(search)
    );

    if ($("totalCustomers")) {
        $("totalCustomers").textContent = customers.length;
    }

    if (filtered.length === 0) {
        container.innerHTML = "<p>No customers found.</p>";
        return;
    }

    container.innerHTML = filtered.map(customer => `
        <div class="customer-item">
            <div>
                <strong>${escapeHTML(customer.name)}</strong>
                <small>${escapeHTML(customer.phone || "No phone number")}</small>
            </div>
            <button type="button"
                onclick="deleteCustomer('${customer.id}')">
                Delete
            </button>
        </div>
    `).join("");
}

function filterCustomers() {
    renderCustomers($("customerSearch")?.value || "");
}
// ==========================================
// PART 5: EXPENSE MANAGEMENT
// ==========================================

async function addExpense() {
    if (!currentBusiness || !cloudReady) {
        showAlert("Please log in before adding expenses.");
        return;
    }

    const description = prompt("Enter expense description:");
    if (description === null) return;

    const amountInput = prompt("Enter expense amount:");
    if (amountInput === null) return;

    const category = prompt("Enter expense category:");
    if (category === null) return;

    const amount = Number(amountInput);

    if (!description.trim() || !Number.isFinite(amount) || amount <= 0) {
        showAlert("Enter a valid description and amount.");
        return;
    }

    try {
        const { error } = await db
            .from("expenses")
            .insert({
                business_id: currentBusiness.id,
                description: description.trim(),
                amount,
                category: category.trim()
            });

        if (error) throw error;

        await loadAllCloudData();
        renderExpenses();

        showAlert("Expense added successfully!");

    } catch (error) {
        console.error("Add expense error:", error);
        showAlert("Unable to add expense.");
    }
}

async function addExpenseFromScreen() {
    await addExpense();
}

async function deleteExpense(expenseId) {
    if (!confirm("Are you sure you want to delete this expense?")) {
        return;
    }

    try {
        const { error } = await db
            .from("expenses")
            .delete()
            .eq("id", expenseId)
            .eq("business_id", currentBusiness.id);

        if (error) throw error;

        await loadAllCloudData();
        renderExpenses();

        showAlert("Expense deleted.");

    } catch (error) {
        console.error("Delete expense error:", error);
        showAlert("Unable to delete expense.");
    }
}

function renderExpenses(searchTerm = "") {
    const container = $("expensesList");
    if (!container) return;

    const search = searchTerm.toLowerCase();

    const filtered = expenses.filter(expense =>
        String(expense.description || "").toLowerCase().includes(search) ||
        String(expense.category || "").toLowerCase().includes(search)
    );

    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    if ($("totalExpenses")) {
        $("totalExpenses").textContent = formatMoney(total);
    }

    if ($("expenseCount")) {
        $("expenseCount").textContent = expenses.length;
    }

    if (filtered.length === 0) {
        container.innerHTML = "<p>No expenses found.</p>";
        return;
    }

    container.innerHTML = filtered.map(expense => `
        <div class="expense-item">
            <div>
                <strong>${escapeHTML(expense.description)}</strong>
                <small>${escapeHTML(expense.category || "General")} · ${formatDate(expense.created_at)}</small>
            </div>
            <strong>${formatMoney(expense.amount)}</strong>
            <button type="button"
                onclick="deleteExpense('${expense.id}')">
                Delete
            </button>
        </div>
    `).join("");
}

function filterExpenses() {
    renderExpenses($("expenseSearch")?.value || "");
}
// ==========================================
// PART 6: AUTHENTICATION
// ==========================================

function showUnauthenticatedApp() {
    if ($("authScreen")) $("authScreen").hidden = false;

    document.querySelector(".topbar")?.style.setProperty("display", "none");
    document.querySelector(".main-content")?.style.setProperty("display", "none");
    document.querySelector(".bottom-nav")?.style.setProperty("display", "none");
}

function showAuthenticatedApp() {
    if ($("authScreen")) $("authScreen").hidden = true;

    document.querySelector(".topbar")?.style.setProperty("display", "flex");
    document.querySelector(".main-content")?.style.setProperty("display", "block");
    document.querySelector(".bottom-nav")?.style.setProperty("display", "flex");

    goHome();
}

function toggleAuthForms(showRegister) {
    clearAuthMessage();

    if ($("loginForm")) {
        $("loginForm").hidden = showRegister;
    }

    if ($("registerForm")) {
        $("registerForm").hidden = !showRegister;
    }
}

async function registerUser(event) {
    event.preventDefault();
    clearAuthMessage();

    const ownerName = $("ownerName")?.value.trim();
    const businessName = $("registerBusinessName")?.value.trim();
    const email = $("registerEmail")?.value.trim();
    const phone = $("registerPhone")?.value.trim();
    const address = $("registerAddress")?.value.trim();
    const category = $("registerCategory")?.value;
    const password = $("registerPassword")?.value;

    if (!ownerName || !businessName || !email || !password) {
        showAuthMessage("Please complete all required fields.");
        return;
    }

    if (password.length < 8) {
        showAuthMessage("Password must contain at least 8 characters.");
        return;
    }

    try {
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    owner_name: ownerName,
                    business_name: businessName
                }
            }
        });

        if (error) throw error;

        if (data.user && data.session) {
            const { error: businessError } = await db
                .from("businesses")
                .insert({
                    owner_id: data.user.id,
                    owner_name: ownerName,
                    business_name: businessName,
                    phone,
                    address,
                    business_category: category
                });

            if (businessError) throw businessError;

            showAuthMessage("Account created successfully!", "success");

            await initializeAuthenticatedUser(data.user);

        } else {
            showAuthMessage(
                "Registration successful. Please check your email to confirm your account.",
                "success"
            );
        }

    } catch (error) {
        console.error("Registration error:", error);
        showAuthMessage(error.message || "Registration failed.");
    }
}

async function loginUser(event) {
    event.preventDefault();
    clearAuthMessage();

    const email = $("loginEmail")?.value.trim();
    const password = $("loginPassword")?.value;

    if (!email || !password) {
        showAuthMessage("Enter your email and password.");
        return;
    }

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        await initializeAuthenticatedUser(data.user);

    } catch (error) {
        console.error("Login error:", error);
        showAuthMessage(error.message || "Unable to log in.");
    }
}

async function initializeAuthenticatedUser(user) {
currentUser = user;

let business = await loadBusinessProfile();

// Create the business profile if it does not exist
if (!business) {
    const metadata = user.user_metadata || {};

    const { data, error } = await db
        .from("businesses")
        .insert({
            owner_id: user.id,
            owner_name: metadata.owner_name || "Business Owner",
            business_name: metadata.business_name || "My Business"
        })
        .select()
        .single();

    if (error) {
        console.error("Business creation error:", error);
        showUnauthenticatedApp();
        showAuthMessage(
            "Unable to create your business profile: " + error.message
        );
        return;
    }

    currentBusiness = data;
} else {
    currentBusiness = business;
}

updateBusinessDisplay();

await loadAllCloudData();

ensureLogoutButton();

showAuthenticatedApp();

}

async function logoutUser() {
    const confirmed = confirm("Are you sure you want to log out?");
    if (!confirmed) return;

    try {
        const { error } = await db.auth.signOut();

        if (error) throw error;

        currentUser = null;
        currentBusiness = null;
        products = [];
        customers = [];
        sales = [];
        expenses = [];
        cloudReady = false;

        showUnauthenticatedApp();
        toggleAuthForms(false);

    } catch (error) {
        console.error("Logout error:", error);
        showAlert("Unable to log out. Please try again.");
    }
}

// ==========================================
// PART 6B: APPLICATION INITIALIZATION
// ==========================================

function initializeApp() {
    // Authentication form links
    $("showRegister")?.addEventListener("click", event => {
        event.preventDefault();
        toggleAuthForms(true);
    });

    $("showLogin")?.addEventListener("click", event => {
        event.preventDefault();
        toggleAuthForms(false);
    });

    // Authentication forms
    $("loginForm")?.addEventListener("submit", loginUser);
    $("registerForm")?.addEventListener("submit", registerUser);

    // Sale form
    $("saleForm")?.addEventListener("submit", recordSale);
    $("saleProduct")?.addEventListener("change", updateSaleTotal);
    $("saleQuantity")?.addEventListener("input", updateSaleTotal);

    // Business profile
    $("businessProfileForm")?.addEventListener("submit", saveBusinessProfile);

    // Search fields
    $("salesSearch")?.addEventListener("input", filterSalesHistory);
    $("productSearch")?.addEventListener("input", filterProducts);
    $("customerSearch")?.addEventListener("input", filterCustomers);
    $("expenseSearch")?.addEventListener("input", filterExpenses);

    // Check current login session
    db.auth.getSession().then(async ({ data, error }) => {
        if (error) {
            console.error("Session error:", error);
            showUnauthenticatedApp();
            return;
        }

        if (data.session?.user) {
            await initializeAuthenticatedUser(data.session.user);
        } else {
            showUnauthenticatedApp();
        }
    });

    // Listen for login/logout changes
    db.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
            currentUser = null;
            currentBusiness = null;
            products = [];
            customers = [];
            sales = [];
            expenses = [];
            cloudReady = false;

            showUnauthenticatedApp();
        }
    });
}

// Start the application
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
} else {
    initializeApp();
}
// ==========================================
// VENDORA RECEIPT SYSTEM
// ==========================================

function showReceipt(details) {
    const modal = $("receiptModal");
    
    if (!modal) {
        showAlert("Receipt section not found.");
        return;
    }
    
    $("receiptBusinessName").textContent =
        currentBusiness?.business_name || "VENDORA";
    
    $("receiptNumber").textContent =
        String(details.id).slice(0, 8).toUpperCase();
    
    $("receiptDate").textContent =
        formatDateTime(details.date);
    
    const customerRow = $("receiptCustomer")?.parentElement;
    
    if (customerRow) {
        if (details.customer?.trim()) {
            $("receiptCustomer").textContent = details.customer.trim();
            customerRow.hidden = false;
        } else {
            $("receiptCustomer").textContent = "";
            customerRow.hidden = true;
        }
    }
    
    const items = details.items || [{
        product_name: details.product,
        quantity: details.quantity,
        unit_price: details.price,
        line_total: details.total
    }];
    
    $("receiptItems").innerHTML = items.map(item => `
    <div class="receipt-item">
        <p><strong>${escapeHTML(item.product_name)}</strong></p>
        <p>
            ${Number(item.quantity)} ×
            ${formatMoney(item.unit_price)}
            = ${formatMoney(item.line_total)}
        </p>
    </div>
`).join("");
    
    $("receiptTotal").textContent =
        formatMoney(details.total);
    const savedPaperSize = localStorage.getItem("vendora_paper_size");

if ($("receiptPaperSize")) {
    $("receiptPaperSize").value = savedPaperSize || "58";
        }
    modal.hidden = false;
    
}
function closeReceipt() {
    const modal = $("receiptModal");

    if (modal) modal.hidden = true;
}

function printReceipt() {
    const receipt = $("receiptContent");
    
    if (!receipt) {
        showAlert("Receipt content not found.");
        return;
    }
    
    const paperSize = $("receiptPaperSize")?.value || "58";
    const paperWidth = paperSize === "80" ? "80mm" : "58mm";
    
    const printWindow = window.open("", "_blank");
    alert("Print window status: " + (printWindow ? "Opened" : "Blocked"));
    if (!printWindow) {
        showAlert("Allow pop-ups in your browser to print receipts.");
        return;
    }
    
    const receiptCopy = receipt.cloneNode(true);
    receiptCopy.querySelectorAll(".receipt-actions, .receipt-printer-settings")
        .forEach(element => element.remove());
    
    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Vendora Receipt</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            @page {
                size: ${paperWidth} auto;
                margin: 2mm;
            }

            * {
                box-sizing: border-box;
            }

            body {
                font-family: Arial, sans-serif;
                width: ${paperWidth};
                margin: 0 auto;
                padding: 2mm;
                color: #111;
                font-size: 11px;
            }

            #receiptContent {
                width: 100%;
                max-width: 100%;
                padding: 0;
                margin: 0;
                max-height: none;
                overflow: visible;
                background: white;
                color: #111;
                box-shadow: none;
                border-radius: 0;
            }

            h2 {
                font-size: 17px;
            }

            h2, h3 {
                text-align: center;
            }

            p {
                margin: 5px 0;
            }

            hr {
                border: none;
                border-top: 1px dashed #777;
                margin: 8px 0;
            }

            .receipt-item {
                margin: 8px 0;
                overflow-wrap: anywhere;
            }

            @media print {
                body {
                    padding: 0;
                }
            }
        </style>
    </head>
    <body>
        ${receiptCopy.outerHTML}
    </body>
    </html>
`);
    
    printWindow.document.close();
    alert("Receipt sent to print window");
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
    
}
function downloadReceipt() {
alert("Download function started");
    console.log("jsPDF status:", window.jspdf);
    console.log("jsPDF available:", typeof window.jspdf?.jsPDF);
    
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showAlert("PDF library is not available. Check your internet connection and refresh.");
        return;
    }
    console.log("PDF library detected:", typeof window.jspdf.jsPDF);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    alert("PDF document created successfully");
    
    const businessName = currentBusiness?.business_name || "VENDORA";
    const receiptNumber = $("receiptNumber")?.textContent || "";
    const receiptDate = $("receiptDate")?.textContent || "";
    const customer = $("receiptCustomer")?.textContent || "";
    const total = $("receiptTotal")?.textContent || "";
    
    let y = 20;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(businessName, 105, y, { align: "center" });
    
    y += 10;
    doc.setFontSize(14);
    doc.text("SALES RECEIPT", 105, y, { align: "center" });
    
    y += 12;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    doc.text("Receipt No: " + receiptNumber, 15, y);
    y += 7;
    doc.text("Date: " + receiptDate, 15, y);
    y += 7;
    doc.text("Customer: " + customer, 15, y);
    
    y += 10;
    doc.line(15, y, 195, y);
    y += 10;
    
    const items = $("receiptItems")?.querySelectorAll(".receipt-item") || [];
    
    items.forEach(item => {
        const name = item.querySelector("strong")?.textContent || "";
        const details = item.querySelectorAll("p")[1]?.textContent || "";
        
        if (y > 260) {
            doc.addPage();
            y = 20;
        }
        
        doc.setFont("helvetica", "bold");
        doc.text(name, 15, y);
        y += 6;
        
        doc.setFont("helvetica", "normal");
        doc.text(details, 15, y);
        y += 10;
    });
    
    doc.line(15, y, 195, y);
    y += 12;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("TOTAL: " + total, 15, y);
    
    y += 15;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Thank you for your patronage!", 105, y, {
        align: "center"
    });
    
    const pdfBlob = doc.output("blob");
const pdfUrl = URL.createObjectURL(pdfBlob);

const link = document.createElement("a");
link.href = pdfUrl;
link.download = "Vendora-Receipt-" + receiptNumber + ".pdf";
document.body.appendChild(link);
link.click();
document.body.removeChild(link);

setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000);
    
}
async function editProduct(productId) {
const product = products.find(
item => String(item.id) === String(productId)
);

if (!product) {
    showAlert("Product not found.");
    return;
}

const name = prompt("Product name:", product.name);
if (name === null) return;

const price = prompt("Selling price:", product.price);
if (price === null) return;

const stock = prompt("Available stock:", product.stock);
if (stock === null) return;

const cleanName = name.trim();
const cleanPrice = Number(price);
const cleanStock = Number(stock);

if (
    !cleanName ||
    !Number.isFinite(cleanPrice) ||
    cleanPrice <= 0 ||
    !Number.isInteger(cleanStock) ||
    cleanStock < 0
) {
    showAlert("Please enter valid product details.");
    return;
}

try {
    const { error } = await db
        .from("products")
        .update({
            name: cleanName,
            price: cleanPrice,
            stock: cleanStock
        })
        .eq("id", product.id)
        .eq("business_id", currentBusiness.id);

    if (error) throw error;

    await loadAllCloudData();
    renderProducts();
    showAlert("Product updated successfully!");

} catch (error) {
    console.error("Edit product error:", error);
    showAlert("Unable to update product: " + error.message);
}

}
async function getSaleReceiptDetails(saleId) {
try {
const { data: sale, error: saleError } = await db
.from("sales")
.select("*")
.eq("id", saleId)
.eq("business_id", currentBusiness.id)
.single();

    if (saleError) throw saleError;

    const { data: items, error: itemsError } = await db
        .from("sale_items")
        .select("*")
        .eq("sale_id", saleId);

    if (itemsError) throw itemsError;

    return {
        id: sale.id,
        customer: sale.customer_name || "Walk-in Customer",
        total: Number(sale.total || 0),
        date: sale.created_at,
        items: items || []
    };

} catch (error) {
    console.error("Receipt retrieval error:", error);
    showAlert("Unable to retrieve receipt: " + error.message);
    return null;
}

}

async function viewSaleReceipt(saleId) {
const details = await getSaleReceiptDetails(saleId);
if (!details) return;

showReceipt({
    ...details,
    product: details.items.map(item => item.product_name).join(", "),
    quantity: details.items.map(item => item.quantity).join(", "),
    price: details.items[0]?.unit_price || 0
});

}

async function reprintSaleReceipt(saleId) {
await viewSaleReceipt(saleId);

setTimeout(() => {
    printReceipt();
}, 300);

}

async function downloadSaleReceipt(saleId) {
const details = await getSaleReceiptDetails(saleId);
if (!details) return;

showReceipt({
    ...details,
    product: details.items.map(item => item.product_name).join(", "),
    quantity: details.items.map(item => item.quantity).join(", "),
    price: details.items[0]?.unit_price || 0
});

setTimeout(() => {
    downloadReceipt();
}, 300);

}
