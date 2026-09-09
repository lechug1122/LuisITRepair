import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../initializer/firebase";

const COLLECTION = "videos_soporte";

export function getVideoEmbedUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/")[2] || "";
      }
    }

    if (videoId && /^[\w-]{6,}$/.test(videoId)) {
      return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const vimeoId = url.pathname.split("/").filter(Boolean).findLast((part) => /^\d+$/.test(part));
      if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
    }
  } catch {
    return "";
  }

  return "";
}

export function subscribeSupportVideos(onData, onError) {
  const videosQuery = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    videosQuery,
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export async function createSupportVideo({ title, url }) {
  const cleanTitle = String(title || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!cleanTitle || !getVideoEmbedUrl(cleanUrl)) throw new Error("Datos de video no válidos.");

  return addDoc(collection(db, COLLECTION), {
    title: cleanTitle,
    url: cleanUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: auth.currentUser?.uid || "",
  });
}

export async function updateSupportVideo(id, { title, url }) {
  const cleanTitle = String(title || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!id || !cleanTitle || !getVideoEmbedUrl(cleanUrl)) throw new Error("Datos de video no válidos.");

  return updateDoc(doc(db, COLLECTION, id), {
    title: cleanTitle,
    url: cleanUrl,
    updatedAt: serverTimestamp(),
  });
}

export function deleteSupportVideo(id) {
  return deleteDoc(doc(db, COLLECTION, id));
}
