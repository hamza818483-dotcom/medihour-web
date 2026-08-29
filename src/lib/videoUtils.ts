
export const extractVideoId = (urlOrId: string) => {
  if (!urlOrId) return null;
  // Robust regex for YouTube IDs handling youtu.be, youtube.com, m.youtube.com, embeds, shorts, live
  const regex = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/|live\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
  const match = urlOrId.match(regex);
  return (match && match[1].length === 11) ? match[1] : (urlOrId.length === 11 ? urlOrId : null);
};

export const getEmbedUrl = (urlOrId: string) => {
  const id = extractVideoId(urlOrId);
  if (!id) return "";
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
};
