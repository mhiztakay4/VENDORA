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
let availableBusinesses = [];

let currentRole = "owner";

let products = [];
let customers = [];
let sales = [];
let expenses = [];
let dailyClosings = [];
let lastGeneratedReport = null;

let cloudReady = false;
async function loadCurrentBusinessRole() {
    if (!currentUser || !currentBusiness) {
        currentRole = null;
        return false;
    }

    // The business owner has full access.
    if (currentBusiness.owner_id === currentUser.id) {
        currentRole = "owner";
        return true;
    }

    // Retrieve the employee's assigned role.
    const { data, error } = await db
        .from("business_members")
        .select("role, status")
        .eq("business_id", currentBusiness.id)
        .eq("user_id", currentUser.id)
        .eq("status", "active")
        .maybeSingle();

    if (error || !data) {
        console.error("Role loading failed:", error);
        currentRole = null;
        showAlert("You do not have active access to this business.");
        return false;
    }

    currentRole = data.role;

    console.log("Current business role:", currentRole);

    return true;
}
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
            expensesResult,
            closingResult
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
                .order("created_at", { ascending: false }),

            db.from("daily_closings")
                .select("*")
                .eq("business_id", businessId)
                .order("closing_date", { ascending: false })

        ]);

        if (productsResult.error) throw productsResult.error;
        if (customersResult.error) throw customersResult.error;
        if (salesResult.error) throw salesResult.error;
        if (expensesResult.error) throw expensesResult.error;
        if (closingResult.error) throw closingResult.error;

        products = productsResult.data || [];
        customers = customersResult.data || [];
        sales = salesResult.data || [];
        expenses = expensesResult.data || [];
        dailyClosings = closingResult.data || [];

        console.log("Vendora products:", products);
        console.log("Vendora sales with item costs:", sales);
        console.log("Vendora daily closings:", dailyClosings);

        cloudReady = true;

refreshDashboard();
renderDashboardStockAlerts();
    } catch (error) {
        console.error("Cloud loading error:", error);

        cloudReady = false;

        showAlert(
            "Unable to load business data. Check your internet connection and try again."
        );
    }
            }
async function confirmDailyClosing() {
    if (!currentBusiness) {
        showAlert("Please log in to your business account.");
        return;
    }

    const button = $("confirmDailyClosingBtn");

    if (button) button.disabled = true;

    try {
        const today = new Date();

        const closingDate = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");

        // Check whether today has already been closed
        const { data: existingClosing, error: checkError } = await db
            .from("daily_closings")
            .select("id")
            .eq("business_id", currentBusiness.id)
            .eq("closing_date", closingDate)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingClosing) {
            showAlert("This business day has already been closed.");
            return;
        }

        // Get today's sales and expenses
        const formatDate = date => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        const todaySales = sales.filter(sale =>
            sale.created_at &&
            formatDate(new Date(sale.created_at)) === closingDate
        );

        const todayExpenses = expenses.filter(expense =>
            expense.created_at &&
            formatDate(new Date(expense.created_at)) === closingDate
        );

        const revenue = todaySales.reduce(
            (sum, sale) => sum + Number(sale.total || 0), 0
        );

        let costOfGoods = 0;

        todaySales.forEach(sale => {
            (sale.sale_items || []).forEach(item => {
                costOfGoods +=
                    Number(item.cost_price || 0) *
                    Number(item.quantity || 0);
            });
        });

        const totalExpenses = todayExpenses.reduce(
            (sum, expense) => sum + Number(expense.amount || 0), 0
        );

        const grossProfit = revenue - costOfGoods;
        const netProfit = grossProfit - totalExpenses;

        // Save the closing statement
        const { error: insertError } = await db
            .from("daily_closings")
            .insert({
                business_id: currentBusiness.id,
                closing_date: closingDate,
                total_revenue: revenue,
                cost_of_goods_sold: costOfGoods,
                gross_profit: grossProfit,
                operating_expenses: totalExpenses,
                net_profit: netProfit,
                sales_count: todaySales.length,
                expenses_count: todayExpenses.length,
                closed_by: (await db.auth.getUser()).data.user?.id || null,
                closing_note: $("closingNote")?.value.trim() || null
            });

        if (insertError) throw insertError;

        showAlert("Business day closed successfully!");

        if ($("closingNote")) {
            $("closingNote").value = "";
        }

        await loadAllCloudData();
        loadDailyClosing();

    } catch (error) {
        console.error("Daily closing error:", error);
        showAlert(error.message || "Unable to close business day.");
        } finally {
        if (button) button.disabled = false;
    }
}

// ==========================================
// BUSINESS PROFILE
// ==========================================

async function loadBusinessProfile() {
    if (!currentUser) return [];

    const { data, error } = await db
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Business loading error:", error);
        throw error;
    }

    return data || [];
}

async function saveBusinessProfile(event) {
    if (event) event.preventDefault();

    if (!currentBusiness || !currentUser) {
        showAlert("Business profile not found.");
        return;
    }

    const businessName = $("businessName")?.value.trim();
    const phone = $("businessPhone")?.value.trim();
    const address = $("businessAddress")?.value.trim();
    const logoFile = $("businessLogo")?.files?.[0];

    if (!businessName) {
        showAlert("Please enter your business name.");
        return;
    }

    try {
        let logoUrl = currentBusiness.logo_url || "";

        // Upload a new logo if one was selected
        if (logoFile) {
            if (!logoFile.type.startsWith("image/")) {
                showAlert("Please select a valid image.");
                return;
            }

            if (logoFile.size > 2 * 1024 * 1024) {
                showAlert("Logo must be smaller than 2MB.");
                return;
            }

            const fileExtension = logoFile.name.split(".").pop();
            const filePath =
                `${currentUser.id}/${Date.now()}.${fileExtension}`;

            const { error: uploadError } = await db.storage
                .from("business-logos")
                .upload(filePath, logoFile, {
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: publicData } = db.storage
                .from("business-logos")
                .getPublicUrl(filePath);

            logoUrl = publicData.publicUrl;
        }

        // Save business information
        const { data, error } = await db
            .from("businesses")
            .update({
                business_name: businessName,
                phone,
                address,
                logo_url: logoUrl
            })
            .eq("id", currentBusiness.id)
            .select()
            .single();

        if (error) throw error;

        currentBusiness = data;

        updateBusinessDisplay();

        if ($("businessLogo")) {
            $("businessLogo").value = "";
        }

        showAlert("Business profile updated successfully.");

    } catch (error) {
        console.error("Profile update error:", error);
        showAlert("Unable to update business profile: " + error.message);
    }
}
function renderBusinessSwitcher() {
    const selector = $("businessSwitcher");
    if (!selector) return;

    selector.innerHTML = "";

    availableBusinesses.forEach(business => {
        const option = document.createElement("option");
        option.value = business.id;
        option.textContent = business.business_name || "My Business";
        selector.appendChild(option);
    });

    selector.value = currentBusiness?.id || "";

    selector.style.display =
        availableBusinesses.length > 1 ? "block" : "none";
}

async function switchBusiness(businessId) {
    const selectedBusiness = availableBusinesses.find(
        business => String(business.id) === String(businessId)
    );

    if (!selectedBusiness || selectedBusiness.id === currentBusiness?.id) {
        return;
    }

    const previousBusiness = currentBusiness;

    try {
        cloudReady = false;

        products = [];
        customers = [];
        sales = [];
        expenses = [];
        dailyClosings = [];

        currentBusiness = selectedBusiness;

updateBusinessDisplay();

// Load the role for the newly selected business.
const roleLoaded = await loadCurrentBusinessRole();

if (!roleLoaded) {
    throw new Error("You do not have access to this business.");
}

await loadAllCloudData();

        if (!cloudReady) {
            throw new Error("Unable to load the selected business data.");
        }

        localStorage.setItem(
            `vendora_business_${currentUser.id}`,
            selectedBusiness.id
        );

        renderBusinessSwitcher();
        goHome();

    } catch (error) {
        console.error("Business switching error:", error);

        currentBusiness = previousBusiness;
        updateBusinessDisplay();
        renderBusinessSwitcher();

        await loadAllCloudData();

        showAlert("Unable to switch business. Please try again.");
    }
}
function updateBusinessDisplay() {
    if (!currentBusiness) return;

    // Business name
    if ($("businessNameDisplay")) {
        $("businessNameDisplay").textContent =
            currentBusiness.business_name || "My Business";
    }
    if ($("businessOwnerNameDisplay")) {
    $("businessOwnerNameDisplay").textContent =
        currentBusiness.owner_name || "Business Owner";
    }
const ownerName = (
    currentBusiness.owner_name || "Business Owner"
).trim();

if ($("businessProfileInitial")) {
    $("businessProfileInitial").textContent =
        ownerName.charAt(0).toUpperCase();
}
    // Business logo
    if ($("businessLogoDisplay")) {
        const logo = currentBusiness.logo_url || "";

        $("businessLogoDisplay").src = logo;
        $("businessLogoDisplay").style.display =
            logo ? "block" : "none";
    }

    // Business profile form
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

    // Show the logged-in business header
    if ($("businessHeader")) {
        $("businessHeader").style.display = "flex";
    }

    if ($("businessProfileBtn")) {
        $("businessProfileBtn").style.display = "block";
    }

    if ($("guestHeader")) {
        $("guestHeader").style.display = "none";
    }

    if ($("guestActions")) {
        $("guestActions").style.display = "none";
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
        "reportsScreen",
        "dailyClosingScreen",
        "newSaleScreen",
        "salesHistoryScreen",
        "productsScreen",
        "customersScreen",
        "expensesScreen",
        "accountScreen",
        "printerSettings",
        "employeesScreen"
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

    if (!products || products.length === 0) {
        showAlert("No products loaded. Please refresh and try again.");
        return;
    }

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
// ==========================================
// EMPLOYEE MANAGEMENT
// ==========================================

function openEmployeeManagement() {
    if (!currentBusiness || !currentUser) {
        showAlert("Please log in first.");
        return;
    }

    showScreen("employeesScreen");
}

// ==========================================
// EMPLOYEE INVITATION
// ==========================================

async function generateEmployeeInvitation(event) {
    event.preventDefault();

    const form = $("employeeInviteForm");
    const message = $("employeeManagementMessage");
    const button = form?.querySelector('button[type="submit"]');

    if (!currentUser || !currentBusiness) {
        message.textContent = "Please log in and select a business.";
        return;
    }

    const email = $("employeeEmail").value.trim().toLowerCase();
    const role = $("employeeRole").value;

    if (!email || !role) {
        message.textContent = "Please enter an email and select a role.";
        return;
    }

    try {
        button.disabled = true;
        button.textContent = "Generating...";
        message.textContent = "Creating invitation...";

        const { data, error } = await db.rpc(
            "create_business_invitation",
            {
                p_business_id: currentBusiness.id,
                p_invited_email: email,
                p_role: role
            }
        );

        if (error) throw error;

        if (!data || !data.success || !data.token) {
            throw new Error("Invitation could not be generated.");
        }

        const invitationLink =
            window.location.origin +
            window.location.pathname +
            "?invite=" +
            encodeURIComponent(data.token);

        message.innerHTML = "";

        const success = document.createElement("p");
        success.textContent =
            "Invitation generated successfully! Expires in 7 days.";

        const linkLabel = document.createElement("p");
        linkLabel.textContent = "Share this invitation link:";

        const linkBox = document.createElement("textarea");
        linkBox.readOnly = true;
        linkBox.value = invitationLink;
        linkBox.style.width = "100%";
        linkBox.style.minHeight = "90px";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Copy Invitation Link";

        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(invitationLink);
                copyButton.textContent = "Copied!";
            } catch (error) {
                linkBox.select();
                document.execCommand("copy");
                copyButton.textContent = "Copied!";
            }
        });

        message.append(success, linkLabel, linkBox, copyButton);
        form.reset();

    } catch (error) {
        console.error("Invitation generation error:", error);
        message.textContent =
            error.message || "Unable to generate invitation.";

    } finally {
        button.disabled = false;
        button.textContent = "Generate Invitation";
    }
    }
function openPrinterSettings() {
    showScreen("printerSettings");
    
    const savedSize = localStorage.getItem("vendora_paper_size") || "58";

    if ($("printerPaperSize")) {
        $("printerPaperSize").value = savedSize;
    }
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
    const form = document.getElementById("addProductForm");
    const productsScreen = document.getElementById("productsScreen");

    if (!form || !productsScreen) {
        showAlert("Product form not found.");
        return;
    }

    // Hide other screens and open Product Inventory
    showScreen("productsScreen");

    // Display Add Product form
    form.hidden = false;

    // Scroll to the form
    form.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}
function closeAddProductForm() {
    const form = document.getElementById("addProductForm");
    const productForm = document.getElementById("productForm");

    form.hidden = true;
    productForm.reset();
}

document.getElementById("productForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = document.getElementById("newProductName").value;
    const costPrice = document.getElementById("newProductCost").value;
    const price = document.getElementById("newProductPrice").value;
    const stock = document.getElementById("newProductStock").value;

    const saved = await addProduct(name, costPrice, price, stock);

    if (saved) {
        closeAddProductForm();
    }
});
function openAddCustomer() {
    const name = prompt("Enter customer name:");
    if (name === null) return;

    const phone = prompt("Enter customer phone number:");
    if (phone === null) return;

    addCustomer(name, phone);
}
function addCustomerFromScreen() {
    openAddCustomer();
}
function generateReport() {
    const period = $("reportPeriod")?.value;
    const today = new Date();

    const formatDate = date => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    let startDate;
    let endDate;

    if (period === "custom") {
        startDate = $("reportStartDate")?.value;
        endDate = $("reportEndDate")?.value;

        if (!startDate || !endDate || startDate > endDate) {
            showAlert("Please select a valid start and end date.");
            return;
        }
    } else if (period === "daily") {
        startDate = formatDate(today);
        endDate = startDate;
    } else if (period === "weekly") {
        const monday = new Date(today);
        const day = monday.getDay();
        monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));

        startDate = formatDate(monday);
        endDate = formatDate(today);
    } else if (period === "monthly") {
        startDate = formatDate(new Date(
            today.getFullYear(),
            today.getMonth(),
            1
        ));
        endDate = formatDate(today);
    }

    const inRange = record => {
        if (!record.created_at) return false;
        const date = formatDate(new Date(record.created_at));
        return date >= startDate && date <= endDate;
    };

    const reportSales = sales.filter(inRange);
    const reportExpenses = expenses.filter(inRange);

    const revenue = reportSales.reduce(
        (sum, sale) => sum + Number(sale.total || 0), 0
    );

    let costOfGoods = 0;
    let missingCostRecords = false;

    reportSales.forEach(sale => {
        (sale.sale_items || []).forEach(item => {
            const cost = Number(item.cost_price || 0);

            if (cost <= 0) {
                missingCostRecords = true;
            }

            costOfGoods += cost * Number(item.quantity || 0);
        });
    });

    const totalExpenses = reportExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    const grossProfit = revenue - costOfGoods;
    const netProfit = grossProfit - totalExpenses;
    lastGeneratedReport = {
    startDate,
    endDate,
    revenue,
    costOfGoods,
    grossProfit,
    totalExpenses,
    netProfit,
    sales: reportSales,
    expenses: reportExpenses,
    missingCostRecords
};

    $("reportResults").innerHTML = `
    <div class="report-period-label">
        <span>📅 REPORTING PERIOD</span>
        <strong>${startDate} — ${endDate}</strong>
    </div>

    <div class="financial-summary-grid">

        <div class="financial-stat revenue-stat">
            <div class="financial-stat-top">
                <span>Total Revenue</span>
                <span class="financial-stat-icon">💰</span>
            </div>
            <h3>${formatMoney(revenue)}</h3>
            <small>Money received from sales</small>
        </div>

        <div class="financial-stat cost-stat">
            <div class="financial-stat-top">
                <span>Cost of Goods Sold</span>
                <span class="financial-stat-icon">📦</span>
            </div>
            <h3>${formatMoney(costOfGoods)}</h3>
            <small>Cost of products sold</small>
        </div>

        <div class="financial-stat expense-stat">
            <div class="financial-stat-top">
                <span>Operating Expenses</span>
                <span class="financial-stat-icon">💳</span>
            </div>
            <h3>${formatMoney(totalExpenses)}</h3>
            <small>Business expenses</small>
        </div>

        <div class="financial-stat profit-stat">
            <div class="financial-stat-top">
                <span>Net Profit</span>
                <span class="financial-stat-icon">📈</span>
            </div>
            <h3>${formatMoney(netProfit)}</h3>
            <small>Profit after all costs</small>
        </div>

    </div>

    <div class="report-extra-summary">
        <div>
            <span>Gross Profit</span>
            <strong>${formatMoney(grossProfit)}</strong>
        </div>

        <div>
            <span>Number of Sales</span>
            <strong>${reportSales.length}</strong>
        </div>
    </div>

    ${
        missingCostRecords
            ? `<div class="report-warning">
                ⚠️ Some products have missing or zero recorded cost prices.
                Profit may be overstated.
               </div>`
            : ""
    }
`;
    const historyContainer = $("dailyClosingHistory");

if (historyContainer) {
    if (!dailyClosings.length) {
        historyContainer.innerHTML = "<p>No closing records yet.</p>";
    } else {
        historyContainer.innerHTML = dailyClosings.map(closing => `
            <div class="transaction-item">
                <div>
                    <strong>${new Date(closing.closing_date + "T00:00:00").toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                    })}</strong>

                    <small>
                        Sales: ${Number(closing.sales_count || 0)}
                        · Expenses: ${Number(closing.expenses_count || 0)}
                    </small>

                    <small>
                        Net profit: ${formatMoney(closing.net_profit)}
                    </small>

                    ${closing.closing_note
                        ? `<small>${escapeHTML(closing.closing_note)}</small>`
                        : ""}
                </div>

                <strong>${formatMoney(closing.total_revenue)}</strong>
            </div>
        `).join("");
    }
                            }
       
}
function openReports() {
    showScreen("reportsScreen");
}
function openDailyClosing() {
    showScreen("dailyClosingScreen");
    loadDailyClosing();
}
function loadDailyClosing() {
    const today = new Date();
    
    const formatDate = date => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const todayString = formatDate(today);

    $("closingDateDisplay").textContent =
        today.toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });

    const todaySales = sales.filter(sale =>
        sale.created_at &&
        formatDate(new Date(sale.created_at)) === todayString
    );

    const todayExpenses = expenses.filter(expense =>
        expense.created_at &&
        formatDate(new Date(expense.created_at)) === todayString
    );

    const revenue = todaySales.reduce(
        (sum, sale) => sum + Number(sale.total || 0), 0
    );

    let costOfGoods = 0;

    todaySales.forEach(sale => {
        (sale.sale_items || []).forEach(item => {
            costOfGoods +=
                Number(item.cost_price || 0) *
                Number(item.quantity || 0);
        });
    });

    const totalExpenses = todayExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    const grossProfit = revenue - costOfGoods;
    const netProfit = grossProfit - totalExpenses;

    $("dailyClosingSummary").innerHTML = `
        <div class="financial-summary-grid">

            <div class="financial-stat revenue-stat">
                <div class="financial-stat-top">
                    <span>Total Revenue</span>
                    <span>💰</span>
                </div>
                <h3>${formatMoney(revenue)}</h3>
            </div>

            <div class="financial-stat cost-stat">
                <div class="financial-stat-top">
                    <span>Cost of Goods Sold</span>
                    <span>📦</span>
                </div>
                <h3>${formatMoney(costOfGoods)}</h3>
            </div>

            <div class="financial-stat expense-stat">
                <div class="financial-stat-top">
                    <span>Operating Expenses</span>
                    <span>💳</span>
                </div>
                <h3>${formatMoney(totalExpenses)}</h3>
            </div>

            <div class="financial-stat profit-stat">
                <div class="financial-stat-top">
                    <span>Net Profit</span>
                    <span>📈</span>
                </div>
                <h3>${formatMoney(netProfit)}</h3>
            </div>

        </div>

        <div class="report-extra-summary">
            <div>
                <span>Gross Profit</span>
                <strong>${formatMoney(grossProfit)}</strong>
            </div>

            <div>
                <span>Number of Sales</span>
                <strong>${todaySales.length}</strong>
            </div>

            <div>
                <span>Expense Transactions</span>
                <strong>${todayExpenses.length}</strong>
            </div>
        </div>
        `;

    // DISPLAY DAILY CLOSING HISTORY
    const historyContainer = $("dailyClosingHistory");

    if (historyContainer) {
        if (!dailyClosings || dailyClosings.length === 0) {
            historyContainer.innerHTML =
                "<p>No closing records yet.</p>";
        } else {
            historyContainer.innerHTML = dailyClosings.map(closing => {
                const closingDate = new Date(
                    closing.closing_date + "T00:00:00"
                ).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                });

                const note = closing.closing_note
                    ? String(closing.closing_note).replace(
                        /[&<>"']/g,
                        char => ({
                            "&": "&amp;",
                            "<": "&lt;",
                            ">": "&gt;",
                            '"': "&quot;",
                            "'": "&#39;"
                        })[char]
                    )
                    : "";

                return `
                    <div class="transaction-item">
                        <div>
                            <strong>${closingDate}</strong>
                            <small>
                                Sales: ${Number(closing.sales_count || 0)}
                                · Expenses: ${Number(closing.expenses_count || 0)}
                            </small>
                            <small>
                                Net Profit: ${formatMoney(closing.net_profit)}
                            </small>
                            ${note ? `<small>${note}</small>` : ""}
                        </div>

                        <strong>
                            ${formatMoney(closing.total_revenue)}
                        </strong>
                    </div>
                `;
            }).join("");
        }
    }
}
// ==========================================
// DASHBOARD
// ==========================================

function refreshDashboard() {
    const today = new Date().toLocaleDateString("en-CA");

    const todaySales = sales.filter(sale =>
        new Date(sale.created_at).toLocaleDateString("en-CA") === today
    );

    const todayExpenses = expenses.filter(expense =>
        new Date(expense.created_at).toLocaleDateString("en-CA") === today
    );

    const totalRevenue = todaySales.reduce(
        (sum, sale) => sum + Number(sale.total || 0), 0
    );

    const totalExpenses = todayExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    const costOfGoodsSold = todaySales.reduce((total, sale) => {
        const items = sale.sale_items || [];

        return total + items.reduce((itemTotal, item) => {
            return itemTotal +
                (Number(item.cost_price || 0) * Number(item.quantity || 0));
        }, 0);
    }, 0);

    const dailyProfit = totalRevenue - costOfGoodsSold - totalExpenses;

    if ($("dashboardRevenue")) {
    actualDashboardRevenue = formatMoney(totalRevenue);

    $("dashboardRevenue").textContent = revenueVisible
        ? actualDashboardRevenue
        : "₦••••••";
}
    if ($("dashboardSales")) {
        $("dashboardSales").textContent = todaySales.length;
    }

    if ($("dashboardExpenses")) {
        $("dashboardExpenses").textContent = formatMoney(totalExpenses);
    }

    if ($("dashboardProfit")) {
        $("dashboardProfit").textContent = formatMoney(dailyProfit);
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

        <div class="transaction-actions">
    <button type="button"
        class="receipt-view-btn"
        onclick="viewSaleReceipt('${sale.id}')">
        🧾 View Receipt
    </button>
</div>
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

let saleItemCounter = 0;

function populateSaleProducts() {
    const container = $("saleItemsContainer");
    if (!container) return;

    container.innerHTML = "";
    saleItemCounter = 0;

    addSaleItemRow();
    updateSaleTotal();
}

function addSaleItemRow() {
    const container = $("saleItemsContainer");
    if (!container) return;

    const rowId = ++saleItemCounter;

    const options = products.map(product => `
        <option value="${product.id}">
            ${escapeHTML(product.name)} — ${formatMoney(product.price)}
            (Stock: ${Number(product.stock || 0)})
        </option>
    `).join("");

    container.insertAdjacentHTML("beforeend", `
        <div class="sale-item-row" id="saleRow${rowId}"
             style="border:1px solid #ddd;padding:12px;border-radius:10px;margin-bottom:10px;">

            <label>Product</label>
            <select class="sale-item-product" required
                    onchange="updateSaleTotal()">
                <option value="">Select a product</option>
                ${options}
            </select>

            <label style="display:block;margin-top:10px;">Quantity</label>
            <input type="number" class="sale-item-quantity"
                   min="1" value="1" required
                   oninput="updateSaleTotal()">

            <small class="sale-item-stock">Available stock: 0</small>

            <button type="button"
                    class="secondary-button"
                    onclick="removeSaleItemRow(${rowId})"
                    style="margin-top:8px;">
                Remove
            </button>
        </div>
    `);

    updateSaleTotal();
}

function removeSaleItemRow(rowId) {
    const row = $("saleRow" + rowId);
    if (row) row.remove();

    updateSaleTotal();
}

function updateSaleTotal() {
    let total = 0;

    document.querySelectorAll(".sale-item-row").forEach(row => {
        const productId = row.querySelector(".sale-item-product")?.value;
        const quantity = Number(
            row.querySelector(".sale-item-quantity")?.value || 0
        );

        const product = products.find(
            item => String(item.id) === String(productId)
        );

        const stockElement = row.querySelector(".sale-item-stock");

        if (product) {
            const stock = Number(product.stock || 0);
            const price = Number(product.price || 0);

            total += price * quantity;

            if (stockElement) {
                stockElement.textContent = "Available stock: " + stock;
            }
        } else if (stockElement) {
            stockElement.textContent = "Available stock: 0";
        }
    });

    const totalElement = $("saleTotal");
    if (totalElement) {
        totalElement.textContent = formatMoney(total);
    }
            }

async function recordSale(event) {
    if (event) event.preventDefault();

    if (!currentBusiness || !cloudReady) {
        showAlert("Please log in and wait for your business data to load.");
        return;
    }

    const customerName =
        $("saleCustomer")?.value.trim() || "Walk-in Customer";

    const rows = [...document.querySelectorAll(".sale-item-row")];

    if (rows.length === 0) {
        showAlert("Please add at least one product.");
        return;
    }

    const groupedItems = new Map();

    for (const row of rows) {
        const productId = row.querySelector(".sale-item-product")?.value;
        const quantity = Number(
            row.querySelector(".sale-item-quantity")?.value || 0
        );

        const product = products.find(
            item => String(item.id) === String(productId)
        );

        if (!product) {
            showAlert("Please select a product in every row.");
            return;
        }

        if (!Number.isInteger(quantity) || quantity < 1) {
            showAlert("Enter a valid quantity for every product.");
            return;
        }

        const existing = groupedItems.get(productId);

        if (existing) {
            existing.quantity += quantity;
        } else {
            groupedItems.set(productId, {
                product_id: productId,
                quantity
            });
        }
    }

    const items = [...groupedItems.values()];

    const requestId = crypto.randomUUID();

    try {
        const { data: sale, error } = await db.rpc(
            "create_business_sale",
            {
                p_business_id: currentBusiness.id,
                p_customer_name: customerName,
                p_items: items,
                p_request_id: requestId
            }
        );

        if (error) throw error;

        await loadAllCloudData();

        $("saleForm")?.reset();
        populateSaleProducts();

        showReceipt({
            id: sale.sale_id,
            customer: sale.customer_name,
            items: sale.items,
            total: sale.total,
            date: sale.created_at
        });

        goHome();

    } catch (error) {
        console.error("Sale error:", error);

        showAlert(
            "Unable to record sale: " +
            (error.message || "Please try again.")
        );

        await loadAllCloudData();
    }
}
let salesHistoryPage = 1;
const SALES_PER_PAGE = 3;

function renderSalesHistory(searchTerm = "") {
const container = $("salesHistoryList");
if (!container) return;

const search = searchTerm.toLowerCase();

const filtered = sales.filter(sale =>
    String(sale.customer_name || "")
        .toLowerCase()
        .includes(search)
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

const totalPages = Math.ceil(filtered.length / SALES_PER_PAGE);

salesHistoryPage = Math.min(
    Math.max(1, salesHistoryPage),
    totalPages
);

const startIndex = (salesHistoryPage - 1) * SALES_PER_PAGE;
const pageSales = filtered.slice(
    startIndex,
    startIndex + SALES_PER_PAGE
);

const transactionHTML = pageSales.map(sale => `
    <div class="transaction-item"
         role="button"
         tabindex="0"
         onclick="viewSaleReceipt('${sale.id}')"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();viewSaleReceipt('${sale.id}')}">

        <div class="transaction-info">
            <strong>${escapeHTML(sale.customer_name || "Walk-in Customer")}</strong>
            <small>${formatDateTime(sale.created_at)}</small>
            <strong class="sale-amount">${formatMoney(sale.total)}</strong>
        </div>

        <div class="transaction-hint">
            <span>🧾</span>
            <small>Tap to view receipt and transaction details</small>
            <span>›</span>
        </div>
    </div>
`).join("");

container.innerHTML = `
    ${transactionHTML}

    <div class="sales-pagination">
        <button
            type="button"
            onclick="salesHistoryPrevious()"
            ${salesHistoryPage === 1 ? "disabled" : ""}>
            Previous
        </button>

        <span>Page ${salesHistoryPage} of ${totalPages}</span>

        <button
            type="button"
            onclick="salesHistoryNext()"
            ${salesHistoryPage === totalPages ? "disabled" : ""}>
            Next
        </button>
    </div>
`;

}

function salesHistoryNext() {
salesHistoryPage++;
renderSalesHistory($("salesSearch")?.value || "");
}

function salesHistoryPrevious() {
salesHistoryPage--;
renderSalesHistory($("salesSearch")?.value || "");
}

function filterSalesHistory() {
salesHistoryPage = 1;
renderSalesHistory($("salesSearch")?.value || "");
    }
// ==========================================
// PART 4: PRODUCT MANAGEMENT
// ==========================================

async function addProduct(name, costPrice, price, stock) {
    if (!currentBusiness || !cloudReady) {
        showAlert("Please log in before adding products.");
        return false;
    }

    name = String(name || "").trim();
    costPrice = Number(costPrice);
    price = Number(price);
    stock = Number(stock);

    if (
        !name ||
        !Number.isFinite(costPrice) || costPrice < 0 ||
        !Number.isFinite(price) || price <= 0 ||
        !Number.isInteger(stock) || stock < 0
    ) {
        showAlert("Enter valid product details.");
        return false;
    }

    try {
        const { error } = await db
            .from("products")
            .insert({
                business_id: currentBusiness.id,
                name,
                cost_price: costPrice,
                price,
                stock
            });

        if (error) throw error;

        await loadAllCloudData();
        renderProducts();

        showAlert("Product added successfully!");
        return true;

    } catch (error) {
        console.error("Add product error:", error);
        showAlert("Unable to add product: " + (error.message || "Please try again."));
        return false;
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

let productsPage = 1;
const PRODUCTS_PER_PAGE = 3;

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
        Number(product.stock || 0) <= 0
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

    const totalPages = Math.ceil(filtered.length / PRODUCTS_PER_PAGE);

productsPage = Math.min(Math.max(1, productsPage), totalPages);

const startIndex = (productsPage - 1) * PRODUCTS_PER_PAGE;
const pageProducts = filtered.slice(
    startIndex,
    startIndex + PRODUCTS_PER_PAGE
);

const productHTML = pageProducts.map(product => {
    const stock = Number(product.stock || 0);

    let stockStatus = "";
    let statusClass = "";

    if (stock <= 0) {
        stockStatus = "Out of Stock";
        statusClass = "out-of-stock";
    } else if (stock <= 5) {
        stockStatus = "Low Stock";
        statusClass = "low-stock";
    } else {
        stockStatus = "In Stock";
        statusClass = "in-stock";
    }

    return `
        <div class="product-item">

            <div class="product-details">
                <strong class="product-name">
                    ${escapeHTML(product.name)}
                </strong>

                <div class="product-prices">
                    <div>
                        <small>Cost Price</small>
                        <strong>${formatMoney(product.cost_price || 0)}</strong>
                    </div>

                    <div>
                        <small>Selling Price</small>
                        <strong>${formatMoney(product.price)}</strong>
                    </div>
                </div>

                <div class="product-stock-info">
                    <span>Stock: ${stock} units</span>
                    <span class="stock-badge ${statusClass}">
                        ${stockStatus}
                    </span>
                </div>
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
    `;
}).join("");

container.innerHTML = `
    ${productHTML}

    <div class="products-pagination">
        <button type="button"
            onclick="productsPrevious()"
            ${productsPage === 1 ? "disabled" : ""}>
            Previous
        </button>

        <span>Page ${productsPage} of ${totalPages}</span>

        <button type="button"
            onclick="productsNext()"
            ${productsPage === totalPages ? "disabled" : ""}>
            Next
        </button>
    </div>
`;
}
    function productsNext() {
    productsPage++;
    renderProducts($("productSearch")?.value || "");
}

function productsPrevious() {
    productsPage--;
    renderProducts($("productSearch")?.value || "");
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

let customersPage = 1;
const CUSTOMERS_PER_PAGE = 3;

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

    const totalPages = Math.ceil(filtered.length / CUSTOMERS_PER_PAGE);

customersPage = Math.min(Math.max(1, customersPage), totalPages);

const startIndex = (customersPage - 1) * CUSTOMERS_PER_PAGE;

const pageCustomers = filtered.slice(
    startIndex,
    startIndex + CUSTOMERS_PER_PAGE
);

const customerHTML = pageCustomers.map(customer => `
    <div class="customer-item">
        <div class="customer-details">
            <strong>${escapeHTML(customer.name)}</strong>
            <small>Phone Number</small>
            <span>${escapeHTML(customer.phone || "No phone number")}</span>
        </div>

        <button type="button"
            onclick="deleteCustomer('${customer.id}')">
            Delete
        </button>
    </div>
`).join("");

container.innerHTML = `
    ${customerHTML}

    <div class="customers-pagination">
        <button type="button"
            onclick="customersPrevious()"
            ${customersPage === 1 ? "disabled" : ""}>
            Previous
        </button>

        <span>Page ${customersPage} of ${totalPages}</span>

        <button type="button"
            onclick="customersNext()"
            ${customersPage === totalPages ? "disabled" : ""}>
            Next
        </button>
    </div>
`;
}
function customersNext() {
    customersPage++;
    renderCustomers($("customerSearch")?.value || "");
}

function customersPrevious() {
    customersPage--;
    renderCustomers($("customerSearch")?.value || "");
}
function filterCustomers() {
    customersPage = 1;
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

let expensesPage = 1;
const EXPENSES_PER_PAGE = 3;

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

    const totalPages = Math.ceil(filtered.length / EXPENSES_PER_PAGE);

expensesPage = Math.min(Math.max(1, expensesPage), totalPages);

const startIndex = (expensesPage - 1) * EXPENSES_PER_PAGE;
const pageExpenses = filtered.slice(
    startIndex,
    startIndex + EXPENSES_PER_PAGE
);

const expenseHTML = pageExpenses.map(expense => `
    <div class="expense-item">
        <div class="expense-details">
            <strong>${escapeHTML(expense.description)}</strong>
            <small>${escapeHTML(expense.category || "General")}</small>
            <small>${formatDate(expense.created_at)}</small>
        </div>

        <div class="expense-actions">
            <strong class="expense-amount">
                ${formatMoney(expense.amount)}
            </strong>

            <button type="button"
                onclick="deleteExpense('${expense.id}')">
                Delete
            </button>
        </div>
    </div>
`).join("");

container.innerHTML = `
    ${expenseHTML}

    <div class="expenses-pagination">
        <button type="button"
            onclick="expensesPrevious()"
            ${expensesPage === 1 ? "disabled" : ""}>
            Previous
        </button>

        <span>Page ${expensesPage} of ${totalPages}</span>

        <button type="button"
            onclick="expensesNext()"
            ${expensesPage === totalPages ? "disabled" : ""}>
            Next
        </button>
    </div>
`;
}
function expensesNext() {
    expensesPage++;
    renderExpenses($("expenseSearch")?.value || "");
}

function expensesPrevious() {
    expensesPage--;
    renderExpenses($("expenseSearch")?.value || "");
}
function filterExpenses() {
    expensesPage = 1;
    renderExpenses($("expenseSearch")?.value || "");
}

// ==========================================
// EMPLOYEE INVITATION AUTHENTICATION
// ==========================================

function getInvitationToken() {
    return new URLSearchParams(window.location.search).get("invite");
}

function showEmployeeInvitation() {
    const token = getInvitationToken();
    if (!token) return false;

    const panel = $("employeeInvitePanel");

    if (panel) panel.hidden = false;

    if ($("loginForm")) $("loginForm").hidden = true;
    if ($("registerForm")) $("registerForm").hidden = true;

    showUnauthenticatedApp();

    return true;
}

function showEmployeeInviteMessage(message) {
    const box = $("employeeInviteMessage");
    if (box) box.textContent = message;
}

async function registerInvitedEmployee() {
    const token = getInvitationToken();
    const fullName = $("employeeFullName")?.value.trim();
    const email = $("employeeInviteEmail")?.value.trim().toLowerCase();
    const password = $("employeeInvitePassword")?.value;

    if (!token || !fullName || !email || !password) {
        showEmployeeInviteMessage("Please complete all fields.");
        return;
    }

    if (password.length < 8) {
        showEmployeeInviteMessage("Password must contain at least 8 characters.");
        return;
    }

    try {
        $("employeeRegisterBtn").disabled = true;
        showEmployeeInviteMessage("Creating your employee account...");

        const redirectUrl =
            window.location.origin +
            window.location.pathname +
            "?invite=" +
            encodeURIComponent(token);

        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: redirectUrl,
                data: {
                    full_name: fullName
                }
            }
        });

        if (error) throw error;

        if (data.session && data.user) {
            await completeEmployeeInvitation(token);
        } else {
            showEmployeeInviteMessage(
                "Account created. Please confirm your email using the link sent to your inbox. Then return through the invitation link to join the business."
            );
        }

    } catch (error) {
        console.error("Employee registration error:", error);
        showEmployeeInviteMessage(error.message || "Registration failed.");
    } finally {
        $("employeeRegisterBtn").disabled = false;
    }
}

async function loginInvitedEmployee() {
    const email = $("employeeInviteEmail")?.value.trim().toLowerCase();
    const password = $("employeeInvitePassword")?.value;

    if (!email || !password) {
        showEmployeeInviteMessage("Enter your invited email and password.");
        return;
    }

    try {
        $("employeeLoginBtn").disabled = true;
        showEmployeeInviteMessage("Signing in...");

        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        await completeEmployeeInvitation(getInvitationToken());

    } catch (error) {
        console.error("Employee login error:", error);
        showEmployeeInviteMessage(error.message || "Unable to sign in.");
    } finally {
        $("employeeLoginBtn").disabled = false;
    }
}

async function completeEmployeeInvitation(token) {
    if (!token) {
        showEmployeeInviteMessage("Invitation token is missing.");
        return;
    }

    try {
        showEmployeeInviteMessage("Verifying your invitation...");

        const { data, error } = await db.rpc(
            "accept_business_invitation",
            { p_token: token }
        );

        if (error) throw error;

        if (!data || !data.success) {
            throw new Error("Invitation could not be accepted.");
        }

        showEmployeeInviteMessage(
            "Invitation accepted! Opening your business..."
        );

        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );

        await initializeAuthenticatedUser(
            (await db.auth.getUser()).data.user,
            data.business_id
        );

    } catch (error) {
        console.error("Invitation acceptance error:", error);
        showEmployeeInviteMessage(
            error.message || "Unable to accept this invitation."
        );
    }
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
    emailRedirectTo: "https://vendora-rho-ivory.vercel.app",
    data: {
    owner_name: ownerName,
    business_name: businessName,
    phone: phone,
    address: address,
    business_category: category
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
    email: email,
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

async function initializeAuthenticatedUser(user, preferredBusinessId = null) {
    currentUser = user;

    try {
        const businesses = await loadBusinessProfile();
        availableBusinesses = businesses || [];

        // Check for a previously selected business
        let savedBusinessId = null;

        try {
            savedBusinessId = localStorage.getItem(
                `vendora_business_${user.id}`
            );
        } catch (error) {
            console.warn("Could not access saved business:", error);
        }

        if (availableBusinesses.length > 0) {

            // Prefer the business from the invitation link
            currentBusiness =
                availableBusinesses.find(
                    business =>
                        String(business.id) === String(preferredBusinessId)
                ) ||
                availableBusinesses.find(
                    business =>
                        String(business.id) === String(savedBusinessId)
                ) ||
                availableBusinesses[0];

        } else {

            // Check whether this account already has a membership
            const { data: memberships, error: membershipError } =
                await db
                    .from("business_members")
                    .select("id, status")
                    .eq("user_id", user.id);

            if (membershipError) throw membershipError;

            if (memberships && memberships.length > 0) {
                showUnauthenticatedApp();

                showAuthMessage(
                    "Your account has no active business access. Please contact the business owner."
                );

                return;
            }

            // Create a business only for a new owner account
            const metadata = user.user_metadata || {};

            const { data, error } = await db
                .from("businesses")
                .insert({
                    owner_id: user.id,
                    owner_name: metadata.owner_name || "Business Owner",
                    business_name: metadata.business_name || "My Business",
                    phone: metadata.phone || "Not provided",
                    address: metadata.address || "Not provided",
                    business_category:
                        metadata.business_category || "General"
                })
                .select()
                .single();

            if (error) throw error;

            currentBusiness = data;
            availableBusinesses = [data];
        }

        localStorage.setItem(
            `vendora_business_${user.id}`,
            currentBusiness.id
        );

        updateBusinessDisplay();
renderBusinessSwitcher();

// Load the role assigned to this business account.
const roleLoaded = await loadCurrentBusinessRole();

if (!roleLoaded) {
    showUnauthenticatedApp();
    return;
}

await loadAllCloudData();

        if (!cloudReady) {
            showUnauthenticatedApp();
            return;
        }

        ensureLogoutButton();
        showAuthenticatedApp();

    } catch (error) {
        console.error("Account initialization error:", error);

        showUnauthenticatedApp();

        showAuthMessage(
            "Unable to load your business account: " + error.message
        );
    }
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
    // Hide dashboard and navigation until login
    showUnauthenticatedApp();
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
    // Employee invitation buttons
$("employeeRegisterBtn")?.addEventListener(
    "click",
    registerInvitedEmployee
);

$("employeeLoginBtn")?.addEventListener(
    "click",
    loginInvitedEmployee
);

// Detect invitation links
if (getInvitationToken()) {
    showEmployeeInvitation();
}

    // Sale form
    $("saleForm")?.addEventListener("submit", recordSale);
    $("saleProduct")?.addEventListener("change", updateSaleTotal);
    $("saleQuantity")?.addEventListener("input", updateSaleTotal);
    // Business switcher
$("businessSwitcher")?.addEventListener("change", event => {
    switchBusiness(event.target.value);
});

    // Business profile
    $("businessProfileForm")?.addEventListener("submit", saveBusinessProfile);
// Employee invitation
$("employeeInviteForm")?.addEventListener(
    "submit",
    generateEmployeeInvitation
);
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

    const invitationToken = getInvitationToken();

    if (invitationToken) {
        await completeEmployeeInvitation(invitationToken);
    } else {
        await initializeAuthenticatedUser(data.session.user);
    }

} else {
    if (getInvitationToken()) {
        showEmployeeInvitation();
    } else {
        showUnauthenticatedApp();
    }
        }
    });

    // Listen for login/logout changes
    db.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
            currentUser = null;
            currentBusiness = null;
            availableBusinesses = [];

const selector = $("businessSwitcher");
if (selector) {
    selector.innerHTML = "";
    selector.style.display = "none";
}
            products = [];
            customers = [];
            sales = [];
            expenses = [];
            cloudReady = false;

            showUnauthenticatedApp();
        }
    });
}
    // Reports date selector
    const reportPeriod = $("reportPeriod");

    if (reportPeriod) {
        reportPeriod.addEventListener("change", function () {
            const customFields = $("customDateFields");

            if (customFields) {
                customFields.hidden = this.value !== "custom";
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

    // Business information
    $("receiptBusinessName").textContent =
        currentBusiness?.business_name || "VENDORA";

    $("receiptBusinessEmail").textContent =
        currentBusiness?.email || "";

    $("receiptBusinessPhone").textContent =
        currentBusiness?.phone || "";

    $("receiptBusinessAddress").textContent =
        currentBusiness?.address || "";

    // Business logo
    const logo = $("receiptBusinessLogo");

    if (logo) {
        if (currentBusiness?.logo_url) {
            logo.src = currentBusiness.logo_url;
            logo.style.display = "block";
        } else {
            logo.src = "";
            logo.style.display = "none";
        }
    }

    // Receipt information
    $("receiptNumber").textContent =
        String(details.id).slice(0, 8).toUpperCase();

    $("receiptDate").textContent =
        formatDateTime(details.date);
const receiptCustomer = $("receiptCustomer");

if (receiptCustomer) {
    receiptCustomer.textContent =
        details.customer_name || "Walk-in Customer";
}
    // Receipt items
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

    // Paper size
    const savedPaperSize =
        localStorage.getItem("vendora_paper_size");

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
            #receiptBusinessLogo {
    width: 25px !important;
    height: 25px !important;
    max-width: 25px !important;
    max-height: 25px !important;
    object-fit: contain !important;
    display: block !important;
    margin: 0 auto 5px !important;
}
            h2, h3 {
                text-align: center;
            }

            p {
    margin: 5px 0;
}

#receiptContent .receipt-business-header {
    text-align: center;
    line-height: 1.4;
}

#receiptContent .receipt-business-header p {
    display: inline;
    font-size: 8px !important;
    margin: 0;
    padding: 0;
}

#receiptContent .receipt-business-header p:not(:last-child)::after {
    content: " | ";
    font-weight: bold;
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
    
    console.log("jsPDF status:", window.jspdf);
    console.log("jsPDF available:", typeof window.jspdf?.jsPDF);
    
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showAlert("PDF library is not available. Check your internet connection and refresh.");
        return;
    }
    console.log("PDF library detected:", typeof window.jspdf.jsPDF);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    
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

const costPrice = prompt(
    "Product cost price:",
    product.cost_price ?? 0
);
if (costPrice === null) return;

const price = prompt("Selling price:", product.price);
if (price === null) return;

const stock = prompt("Available stock:", product.stock);
if (stock === null) return;

const cleanName = name.trim();
const cleanCostPrice = Number(costPrice);
const cleanPrice = Number(price);
const cleanStock = Number(stock);

if (
    !cleanName ||
    !Number.isFinite(cleanCostPrice) || cleanCostPrice < 0 ||
    !Number.isFinite(cleanPrice) || cleanPrice <= 0 ||
    !Number.isInteger(cleanStock) || cleanStock < 0
) {
    showAlert("Please enter valid product details.");
    return;
}

try {
    const { error } = await db
        .from("products")
        .update({
            name: cleanName,
            cost_price: cleanCostPrice,
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
$("receiptPaperSize")?.addEventListener("change", function () {
    localStorage.setItem("vendora_paper_size", this.value);
});
function savePrinterSettings() {
    const paperSize = $("printerPaperSize")?.value || "58";

    localStorage.setItem("vendora_paper_size", paperSize);

    const receiptSelector = $("receiptPaperSize");

    if (receiptSelector) {
        receiptSelector.value = paperSize;
    }

    showAlert("Printer settings saved successfully!");
}
function testPrintReceipt() {
    const testDetails = {
        id: "TEST-0001",
        date: new Date().toISOString(),
        customer: "",
        total: 2500,
        items: [
            {
                product_name: "Sample Product",
                quantity: 2,
                unit_price: 1250,
                line_total: 2500
            }
        ]
    };

    showReceipt(testDetails);

    setTimeout(() => {
        printReceipt();
    }, 500);
}
function downloadReport(type) {
    if (!lastGeneratedReport) {
        showAlert("Please generate a report first.");
        return;
    }

    if (type === "excel") {
    const report = lastGeneratedReport;

    const summary = [
        ["VENDORA BUSINESS REPORT"],
        ["Period", `${report.startDate} to ${report.endDate}`],
        [],
        ["Metric", "Amount"],
        ["Total Revenue", report.revenue],
        ["Cost of Goods Sold", report.costOfGoods],
        ["Gross Profit", report.grossProfit],
        ["Operating Expenses", report.totalExpenses],
        ["Net Profit", report.netProfit],
        ["Number of Sales", report.sales.length]
    ];

    const salesData = [
        ["Date", "Customer", "Amount"],
        ...report.sales.map(sale => [
            sale.created_at || "",
            sale.customer_name || "Walk-in Customer",
            Number(sale.total || 0)
        ])
    ];

    const expenseData = [
        ["Date", "Description", "Category", "Amount"],
        ...report.expenses.map(expense => [
            expense.created_at || "",
            expense.description || "",
            expense.category || "",
            Number(expense.amount || 0)
        ])
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(summary),
        "Summary"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(salesData),
        "Sales"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(expenseData),
        "Expenses"
    );

    XLSX.writeFile(
        workbook,
        `Vendora-Report-${report.startDate}-to-${report.endDate}.xlsx`
    );

    return;
}
if (type === "pdf") {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showAlert("PDF library unavailable. Please refresh the app.");
        return;
    }

    const report = lastGeneratedReport;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const businessName =
        currentBusiness?.business_name || "VENDORA";

    let y = 20;

    // Report heading
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(businessName, 105, y, { align: "center" });

    y += 10;
    doc.setFontSize(16);
    doc.text("BUSINESS REPORT", 105, y, { align: "center" });

    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
        `Period: ${report.startDate} to ${report.endDate}`,
        15,
        y
    );

    y += 12;
    doc.line(15, y, 195, y);
    y += 10;

    // Financial summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("FINANCIAL SUMMARY", 15, y);

    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const summary = [
        ["Total Revenue", report.revenue],
        ["Cost of Goods Sold", report.costOfGoods],
        ["Gross Profit", report.grossProfit],
        ["Operating Expenses", report.totalExpenses],
        ["Net Profit", report.netProfit],
        ["Number of Sales", report.sales.length]
    ];

    summary.forEach(([label, value]) => {
        doc.text(String(label), 15, y);
        doc.text(
            typeof value === "number" && label !== "Number of Sales"
                ? formatMoney(value)
                : String(value),
            195,
            y,
            { align: "right" }
        );
        y += 8;
    });

    y += 8;
    doc.line(15, y, 195, y);
    y += 10;

    // Sales details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("SALES DETAILS", 15, y);

    y += 9;
    doc.setFontSize(9);

    report.sales.forEach(sale => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }

        doc.setFont("helvetica", "normal");

        const customer = sale.customer_name || "Walk-in Customer";
        const date = formatDateTime(sale.created_at);
        const amount = formatMoney(sale.total);

        doc.text(date, 15, y);
        doc.text(customer.substring(0, 35), 85, y);
        doc.text(amount, 195, y, { align: "right" });

        y += 7;
    });

    y += 8;

    // Expense details
    if (y > 255) {
        doc.addPage();
        y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("EXPENSE DETAILS", 15, y);

    y += 9;

    report.expenses.forEach(expense => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        doc.text(
            formatDateTime(expense.created_at),
            15,
            y
        );

        doc.text(
            String(expense.description || "").substring(0, 35),
            85,
            y
        );

        doc.text(
            formatMoney(expense.amount),
            195,
            y,
            { align: "right" }
        );

        y += 7;
    });

    // Footer
    if (y > 270) {
        doc.addPage();
        y = 20;
    }

    y += 10;
    doc.setFontSize(10);
    doc.text(
        "Generated by VENDORA Business Management",
        105,
        y,
        { align: "center" }
    );

    doc.save(
        `Vendora-Report-${report.startDate}-to-${report.endDate}.pdf`
    );

    return;
}
if (type !== "csv") {
    showAlert("Unsupported download format.");
    return;
                   }

    const report = lastGeneratedReport;

    const rows = [
        ["VENDORA BUSINESS REPORT"],
        ["Period", `${report.startDate} to ${report.endDate}`],
        [],
        ["Metric", "Amount"],
        ["Total Revenue", report.revenue],
        ["Cost of Goods Sold", report.costOfGoods],
        ["Gross Profit", report.grossProfit],
        ["Operating Expenses", report.totalExpenses],
        ["Net Profit", report.netProfit],
        ["Number of Sales", report.sales.length],
        [],
        ["SALES DETAILS"],
        ["Date", "Customer", "Amount"]
    ];

    report.sales.forEach(sale => {
        rows.push([
            sale.created_at || "",
            sale.customer_name || "Walk-in Customer",
            Number(sale.total || 0)
        ]);
    });

    rows.push(
        [],
        ["EXPENSE DETAILS"],
        ["Date", "Description", "Category", "Amount"]
    );

    report.expenses.forEach(expense => {
        rows.push([
            expense.created_at || "",
            expense.description || "",
            expense.category || "",
            Number(expense.amount || 0)
        ]);
    });

    const csv = rows.map(row =>
        row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
    ).join("\r\n");

    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
        `Vendora-Report-${report.startDate}-to-${report.endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderDashboardStockAlerts() {
    const section = $("dashboardStockAlerts");
    const container = $("dashboardStockAlertsList");

    if (!section || !container) return;

    const alerts = products.filter(product =>
        Number(product.stock || 0) <= 5
    );

    if (alerts.length === 0) {
        section.hidden = true;
        return;
    }

    section.hidden = false;

    container.innerHTML = alerts.map(product => {
        const stock = Number(product.stock || 0);
        const isOut = stock <= 0;

        return `
            <div class="dashboard-stock-alert">
                <div>
                    <strong>${escapeHTML(product.name)}</strong>
                    <small>
                        ${isOut ? "Out of Stock" : "Only " + stock + " units remaining"}
                    </small>
                </div>

                <span class="${isOut ? "out-of-stock" : "low-stock"}">
                    ${isOut ? "OUT" : "LOW"}
                </span>
            </div>
        `;
    }).join("");
}
// VENDORA: HIDE / SHOW DASHBOARD REVENUE
let revenueVisible = true;
let actualDashboardRevenue = "₦0.00";

function toggleRevenueVisibility() {
    const revenue = document.getElementById("dashboardRevenue");
    const button = document.getElementById("toggleRevenue");

    if (!revenue || !button) return;

    revenueVisible = !revenueVisible;

    revenue.textContent = revenueVisible
        ? actualDashboardRevenue
        : "₦••••••";

    button.textContent = revenueVisible ? "👁" : "🙈";
    button.setAttribute(
        "aria-label",
        revenueVisible ? "Hide revenue" : "Show revenue"
    );
}
