// ─── Theme Toggle ────────────────────────────────────────────────
    const html = document.documentElement;
    const toggle = document.getElementById('theme-toggle');

    toggle.addEventListener('click', () => {
      html.classList.toggle('dark');
      localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
    });

    // Persist theme
    if (localStorage.getItem('theme') === 'light') {
      html.classList.remove('dark');
    }

    // ─── Mobile Menu ─────────────────────────────────────────────────
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');

    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });

    // Close mobile menu on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => mobileMenu.classList.remove('open'));
    });

    // ─── Scroll Animations ───────────────────────────────────────────
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // Stagger siblings
          const siblings = entry.target.parentElement.querySelectorAll('[data-animate]');
          let delay = 0;
          siblings.forEach((el, idx) => {
            if (el === entry.target) delay = idx * 80;
          });
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, delay);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

    // ─── Project Filter Tabs ──────────────────────────────────────────
    const tabs = document.querySelectorAll('.tab-btn');
    const cards = document.querySelectorAll('#projects-grid > [data-category]');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.classList.add('opacity-50');
        });
        tab.classList.add('active');
        tab.classList.remove('opacity-50');

        const filter = tab.dataset.tab;
        cards.forEach(card => {
          if (filter === 'all' || card.dataset.category === filter) {
            card.style.display = '';
            card.style.opacity = '0';
            card.style.transform = 'translateY(12px)';
            requestAnimationFrame(() => {
              card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
              card.style.opacity = '1';
              card.style.transform = 'none';
            });
          } else {
            card.style.display = 'none';
          }
        });
      });
    });