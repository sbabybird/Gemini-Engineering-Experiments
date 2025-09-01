document.addEventListener('DOMContentLoaded', () => {
    // --- === YEAR PROGRESS SECTION === ---

    // --- DOM Element References ---
    const currentDateEl = document.getElementById('current-date');
    const currentDayEl = document.getElementById('current-day');
    const progressPercentageEl = document.getElementById('progress-percentage');
    const dayOfYearEl = document.getElementById('day-of-year');
    const daysRemainingEl = document.getElementById('days-remaining');
    const progressBar = document.querySelector('.progress-ring__bar');

    // --- Constants ---
    const radius = progressBar.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    // --- Initial Setup ---
    progressBar.style.strokeDasharray = `${circumference} ${circumference}`;
    progressBar.style.strokeDashoffset = circumference;

    // --- Main Logic ---
    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    function getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    function updateYearProgress() {
        const now = new Date();
        const year = now.getFullYear();
        const dayOfYear = getDayOfYear(now);
        const totalDaysInYear = isLeapYear(year) ? 366 : 365;
        const daysRemaining = totalDaysInYear - dayOfYear;

        const progressPercentage = (dayOfYear / totalDaysInYear) * 100;

        // Update Text Content
        currentDateEl.textContent = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        currentDayEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long' });
        progressPercentageEl.textContent = `${progressPercentage.toFixed(2)}%`;
        dayOfYearEl.textContent = `${dayOfYear} / ${totalDaysInYear}`;
        daysRemainingEl.textContent = daysRemaining;

        // Update Progress Ring
        const offset = circumference - (progressPercentage / 100) * circumference;
        progressBar.style.strokeDashoffset = offset;
    }

    // --- === LIFE PROGRESS SECTION === ---

    const birthdayInput = document.getElementById('birthday-input');
    const lifeGrid = document.getElementById('life-grid');
    const TOTAL_YEARS = 80;
    const WEEKS_IN_YEAR = 52;
    const TOTAL_WEEKS = TOTAL_YEARS * WEEKS_IN_YEAR;

    function createLifeGrid() {
        lifeGrid.innerHTML = ''; // Clear existing grid
        for (let i = 0; i < TOTAL_WEEKS; i++) {
            const weekBox = document.createElement('div');
            weekBox.classList.add('week-box');
            weekBox.title = `Year ${Math.floor(i / WEEKS_IN_YEAR) + 1}, Week ${i % WEEKS_IN_YEAR + 1}`;
            lifeGrid.appendChild(weekBox);
        }
    }

    function updateLifeProgress(birthdayString) {
        if (!birthdayString) return;

        const birthdayDate = new Date(birthdayString);
        const today = new Date();

        const weeksPassed = Math.floor((today - birthdayDate) / (1000 * 60 * 60 * 24 * 7));

        const weekBoxes = lifeGrid.querySelectorAll('.week-box');
        for (let i = 0; i < TOTAL_WEEKS; i++) {
            if (i < weeksPassed) {
                weekBoxes[i].classList.add('past');
            } else {
                weekBoxes[i].classList.remove('past');
            }
        }
    }

    birthdayInput.addEventListener('change', (e) => {
        const birthday = e.target.value;
        if (birthday) {
            localStorage.setItem('userBirthday', birthday);
            updateLifeProgress(birthday);
        }
    });

    // --- === INITIAL RUN === ---
    updateYearProgress();
    createLifeGrid();

    // Check for a saved birthday, otherwise use the default
    let initialBirthday = localStorage.getItem('userBirthday');
    if (!initialBirthday) {
        initialBirthday = '1980-01-01';
    }
    
    // Set the input field and update the grid
    birthdayInput.value = initialBirthday;
    updateLifeProgress(initialBirthday);
});

// --- Add SVG Gradient Defs to Body ---
const svgDefs = `
<svg class="hidden-defs">
    <defs>
        <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:var(--accent-color-1);stop-opacity:1" />
            <stop offset="100%" style="stop-color:var(--accent-color-2);stop-opacity:1" />
        </linearGradient>
    </defs>
</svg>
`;
document.body.insertAdjacentHTML('beforeend', svgDefs);
