export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ১. ভিডিও রিসিভ করে R2 তে আপলোড করা
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('video');
        if (!file) return new Response('No video found', { status: 400 });

        const filename = `video_${Date.now()}.webm`;
        await env.BUCKET.put(filename, file.stream(), {
          httpMetadata: { contentType: 'video/webm' }
        });

        // স্টোরেজ লিমিট: ৫০ টির বেশি ভিডিও হলে পুরোনোটি ডিলিট করে দেবে
        const list = await env.BUCKET.list({ prefix: 'video_' });
        if (list.objects.length > 50) {
          list.objects.sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime());
          const toDelete = list.objects.length - 50;
          for (let i = 0; i < toDelete; i++) {
            await env.BUCKET.delete(list.objects[i].key);
          }
        }
        return new Response(JSON.stringify({ success: true, filename }), { status: 200 });
      } catch (error) {
        return new Response(error.message, { status: 500 });
      }
    }

    // ২. এডমিনের জন্য ভিডিও লিস্ট পাঠানো
    if (url.pathname === '/api/videos' && request.method === 'GET') {
      const pwd = url.searchParams.get('pwd');
      if (pwd !== '74722222') return new Response('Unauthorized', { status: 401 });

      const list = await env.BUCKET.list({ prefix: 'video_' });
      const files = list.objects.map(obj => ({
        filename: obj.key,
        timestamp: obj.uploaded.getTime()
      })).sort((a, b) => b.timestamp - a.timestamp); // নতুন ভিডিও আগে দেখাবে

      return new Response(JSON.stringify(files), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ৩. ভিডিও প্লে করা বা দেখার API
    if (url.pathname.startsWith('/api/video/view/')) {
      const pwd = url.searchParams.get('pwd');
      if (pwd !== '74722222') return new Response('Unauthorized', { status: 401 });

      const key = url.pathname.split('/').pop();
      const object = await env.BUCKET.get(key);
      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      return new Response(object.body, { headers });
    }

    // ৪. ভিডিও ডিলিট করার API
    if (url.pathname.startsWith('/api/video/delete/')) {
      const pwd = url.searchParams.get('pwd');
      if (pwd !== '74722222') return new Response('Unauthorized', { status: 401 });

      const key = url.pathname.split('/').pop();
      await env.BUCKET.delete(key);
      return new Response(JSON.stringify({ success: true }));
    }

    // ৫. অন্য সব রিকোয়েস্টের জন্য index.html (Cloudflare Pages) লোড করা
    return env.ASSETS.fetch(request);
  }
};
