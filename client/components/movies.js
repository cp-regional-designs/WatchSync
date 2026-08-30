(function (global) {
  async function fetchCategory(cat, type, page) {
    const res = await fetch(`/api/tmdb/category?cat=${encodeURIComponent(cat)}&type=${type}&page=${page}`);
    return res.json();
  }
  async function search(q, type, page) {
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`);
    return res.json();
  }

  function cardHtml(item) {
    const poster = item.poster
      ? `<img class="poster" src="${esc(item.poster)}" alt="" loading="lazy">`
      : `<div class="poster-fallback">?</div>`;
    return `<button class="movie-card" data-id="${item.id}" data-type="${item.mediaType}" data-title="${esc(item.title)}" data-poster="${esc(item.poster || "")}">
      ${poster}
      <div class="card-info">
        <div class="card-title">${esc(item.title)}</div>
        <div class="card-meta">★ ${esc(item.rating)} ${item.year ? "· " + esc(item.year) : ""}</div>
      </div>
    </button>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.WSMovies = { fetchCategory, search, cardHtml };
})(window);
