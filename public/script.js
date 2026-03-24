function handleSubmit(e) {
  e.preventDefault();

  const input = document.getElementById('contact');
  const successMsg = document.getElementById('success-msg');
  const value = input.value.trim();

  if (!value) return;

  // Basic validation: email or phone
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isPhone = /^[\+]?[\d\s\-\(\)]{7,15}$/.test(value);

  if (!isEmail && !isPhone) {
    input.style.borderBottom = '1.5px solid #c0392b';
    input.placeholder = 'Please enter a valid email or phone number';
    input.value = '';
    return;
  }

  // Success state
  input.closest('.input-group').style.opacity = '0';
  input.closest('.input-group').style.transition = 'opacity 0.4s ease';

  setTimeout(() => {
    input.closest('.input-group').style.display = 'none';
    successMsg.classList.add('visible');
  }, 400);
}

// Subtle parallax on hero text
document.addEventListener('mousemove', (e) => {
  const hero = document.querySelector('.coming-soon');
  if (!hero) return;
  const x = (e.clientX / window.innerWidth - 0.5) * 6;
  const y = (e.clientY / window.innerHeight - 0.5) * 6;
  hero.style.transform = `translate(${x}px, ${y}px)`;
  hero.style.transition = 'transform 0.4s ease';
});
