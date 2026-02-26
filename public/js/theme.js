/**
 * 다크 모드 토글 — DESIGN_SYSTEM 10
 * document.documentElement.classList.toggle('dark') + localStorage
 */
(function () {
    function updateIcon(isDark) {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        var sun = btn.querySelector('.icon-sun');
        var moon = btn.querySelector('.icon-moon');
        if (sun && moon) {
            sun.style.display = isDark ? 'none' : 'block';
            moon.style.display = isDark ? 'block' : 'none';
        }
    }

    function applyTheme(dark) {
        if (dark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
        updateIcon(dark);
    }

    function toggleTheme() {
        var isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateIcon(isDark);
    }

    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', toggleTheme);

    // 초기 아이콘 상태
    updateIcon(document.documentElement.classList.contains('dark'));
})();
