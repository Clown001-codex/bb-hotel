document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.site-nav');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  const backTop = document.querySelector('.back-top');

  const updateScroll = () => {
    nav?.classList.toggle('scrolled', window.scrollY > 40);
    backTop?.classList.toggle('show', window.scrollY > 500);
  };
  updateScroll();
  window.addEventListener('scroll', updateScroll, { passive: true });

  toggle?.addEventListener('click', () => links?.classList.toggle('open'));
  links?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  backTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Set today's date as the earliest check-in date and keep check-out after it.
  const checkIn = document.querySelector('[name="checkin"]');
  const checkOut = document.querySelector('[name="checkout"]');
  if (checkIn && checkOut) {
    const today = new Date();
    const iso = today.toISOString().split('T')[0];
    checkIn.min = iso;
    checkOut.min = iso;
    checkIn.addEventListener('change', () => {
      checkOut.min = checkIn.value || iso;
      if (checkOut.value && checkOut.value < checkOut.min) checkOut.value = checkOut.min;
    });
  }

  document.querySelectorAll('[data-booking-form]').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = Object.fromEntries(new FormData(form).entries());
      const ref = 'BB-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      localStorage.setItem('bbHotelBooking', JSON.stringify({ ...data, reference: ref, createdAt: new Date().toISOString() }));
      const message = form.querySelector('.form-message');
      if (message) { message.textContent = `Request received. Your reference is ${ref}. Our reservations team will contact you shortly.`; message.classList.add('show'); }
      form.reset();
    });
  });

  document.querySelectorAll('[data-contact-form]').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const message = form.querySelector('.form-message');
      if (message) { message.textContent = 'Thank you. Your message has been received by BB Hotel.'; message.classList.add('show'); }
      form.reset();
    });
  });

  // Subtle entrance animations that never hide content if JS is unavailable.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('[data-reveal]').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
    observer.observe(el);
  });
});
