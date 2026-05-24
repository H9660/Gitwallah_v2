async function test() {
   try {
     const regRes = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'testuser' + Date.now(),
            email: 'test' + Date.now() + '@example.com',
            password: 'password123'
        })
     });
     if (!regRes.ok) {
         console.error('❌ Registration failed:', await regRes.text());
         return;
     }
     const regData = await regRes.json();
     console.log('✅ Registered:', regData.user.username);
     const token = regData.token;
     
     const profRes = await fetch('http://localhost:3000/api/profile', {
        headers: { Authorization: `Bearer ${token}` }
     });
     if (!profRes.ok) {
         console.error('❌ Profile fetch failed:', await profRes.text());
         return;
     }
     const profile = await profRes.json();
     console.log('✅ Profile User Fetched:', profile.user.username);
     console.log('✅ History length:', profile.history.length);
   } catch (e) {
     console.error('❌ Test Failed:', e.message);
   }
}
test();
