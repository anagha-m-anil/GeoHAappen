// public/frontend.js
let userLat = null;
let userLon = null;
let map = null;
let userMarker = null;      // Blue marker for user's location

let eventMarkers = [];      // Red markers for events

import { auth } from "./auth.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Helper to format 24h string ("13:05") as 12h am/pm ("1:05 PM")
function formatTimeAMPM(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return timeStr;
  let [hour, minute] = timeStr.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute)) return timeStr;
  let ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimestamp(raw) {
  if (!raw) return new Date(0);
  if (typeof raw.toDate === "function") return raw.toDate();
  if (raw._seconds) return new Date(raw._seconds * 1000);
  if (typeof raw === "string" || typeof raw === "number") return new Date(raw);
  return new Date(raw);
}

document.addEventListener("DOMContentLoaded", () => {

  const landingSection = document.getElementById("landing-section");
  const startFindBtn = document.getElementById("startFindBtn");

  const authSection = document.getElementById("auth-section");
  const appSection = document.getElementById("app-section");

  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      // Hide all tabs
      tabContents.forEach(c => c.classList.add("hidden"));
      // Remove active class from all buttons
      tabButtons.forEach(b => b.classList.remove("active"));

      // Show clicked tab
      document.getElementById(tabId).classList.remove("hidden");
      btn.classList.add("active");

      // Show/hide map
      document.getElementById("map").style.display = tabId === "viewTab" ? "block" : "none";

     
    });
  });

  const addTabBtn = document.querySelector('[data-tab="addTab"]');
  const viewTabBtn = document.querySelector('[data-tab="viewTab"]');

  const titleEl = document.getElementById("title");
  const descEl = document.getElementById("description");
  const venueEl = document.getElementById("venue");
  const latEl = document.getElementById("lat");
  const lonEl = document.getElementById("lon");
  const categoryEl = document.getElementById("category");
  const startDateEl = document.getElementById("start-date");
  const startTimeEl = document.getElementById("start-time");
  const endDateEl = document.getElementById("end-date");
  const endTimeEl = document.getElementById("end-time");

  const createBtn = document.getElementById("createEventBtn");
  const eventsDiv = document.getElementById("events");
  const mapDiv = document.getElementById("map");

  const filterCategoryEl = document.getElementById("filter-category");
  const filterStartDateEl = document.getElementById("filter-start-date");
  const filterEndDateEl = document.getElementById("filter-end-date");
  const applyFiltersBtn = document.getElementById("apply-filters");

  // ✅ New button for recommended (liked) events
  const viewLikedEventsBtn = document.getElementById("view-liked-events");
 
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Previous";
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";

  let currentPage = 1;
  const itemsPerPage = 6;

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadEvents(currentPage);
    }
  });

  nextBtn.addEventListener("click", () => {
    currentPage++;
    loadEvents(currentPage);
  });

  tabContents.forEach((c) => c.classList.add("hidden"));

  addTabBtn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.add("hidden"));

    addTabBtn.classList.add("active");
    document.getElementById("addTab").classList.remove("hidden");

    eventsDiv.innerHTML = "";
    mapDiv.style.display = "none";
  });

  viewTabBtn.addEventListener("click", () => {
    currentPage = 1;
    loadEvents(currentPage);

    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.add("hidden"));

    viewTabBtn.classList.add("active");
    document.getElementById("viewTab").classList.remove("hidden");

    mapDiv.style.display = "block";

    if (map) {
      map.setCenter({ lat: userLat || 0, lng: userLon || 0 });
      map.setZoom(userLat ? 12 : 2);
    } else {
      initMap();
    }
  });

  startFindBtn.addEventListener("click", () => {
    landingSection.classList.add("hidden");
    authSection.classList.remove("hidden");
  });

  registerBtn?.addEventListener("click", async () => {
    try {
      await createUserWithEmailAndPassword(auth, emailEl.value, passEl.value);
      alert("Registered successfully!");
    } catch (err) {
      alert("Register error: " + (err.message || err));
    }
  });

  loginBtn?.addEventListener("click", async () => {
    try {
      await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
      alert("Logged in!");
    } catch (err) {
      alert("Login error: " + (err.message || err));
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      alert("Logged out");
    } catch (err) {
      alert("Logout error: " + (err.message || err));
    }
  });

  // ================= Auth State Handling + Geolocation =================
  onAuthStateChanged(auth, async (user) => {
    const landingSection = document.getElementById("landing-section");
    const authSection = document.getElementById("auth-section");
    const appSection = document.getElementById("app-section");

    if (user) {
      //  Hide landing/login pages
      landingSection.classList.add("hidden");
      authSection.classList.add("hidden");

      //  Show dashboard
      appSection.classList.remove("hidden");

      // ========== NEW LINES: Hide both tabs after login/registration ==========
      document.getElementById("addTab").classList.add("hidden");
      document.getElementById("viewTab").classList.add("hidden");
      tabButtons.forEach(b => b.classList.remove("active"));
      // ========================================================================

      // Hide map & event cards initially
      document.getElementById("map").style.display = "none";
      eventsDiv.innerHTML = "";

      // Request geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            userLat = position.coords.latitude;
            userLon = position.coords.longitude;

            if (!map) initMap();
            else {
              if (userMarker) userMarker.setMap(null);
              userMarker = new google.maps.Marker({
                position: { lat: userLat, lng: userLon },
                map: map,
                title: "Your Location",
                icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
              });
              map.setCenter({ lat: userLat, lng: userLon });
              map.setZoom(12);
            }
          },
          (err) => {
            console.error("Geolocation error:", err.message);
            if (!map) initMap();
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        if (!map) initMap();
      }

    } else {
      // Show login/landing only if user is NOT logged in
      landingSection.classList.remove("hidden");
      authSection.classList.add("hidden");
      appSection.classList.add("hidden");

      
    }
  });

  


  function initMap() {
    const center = { lat: userLat || 0, lng: userLon || 0 };
    map = new google.maps.Map(mapDiv, {
      zoom: userLat ? 12 : 2,
      center: center,
    });

    if (userMarker) {
      userMarker.setMap(null);
      userMarker = null;
    }
    

    if (userLat && userLon) {
      userMarker = new google.maps.Marker({
        position: center,
        map: map,
        title: "Your Location",
        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
      });
    }
  }

  function clearMapMarkers() {
    eventMarkers.forEach((m) => m.setMap(null));
    eventMarkers = [];
  }

  createBtn?.addEventListener("click", async () => {
    const title = titleEl.value.trim();
    const description = descEl.value.trim();
    const venue = venueEl.value.trim();
    const lat = parseFloat(latEl.value);
    const lon = parseFloat(lonEl.value);
    const category = categoryEl.value.trim();
    const startDate = startDateEl.value;
    const startTime = startTimeEl.value;
    const endDate = endDateEl.value;
    const endTime = endTimeEl.value;

    if (!title) return alert("Enter event title");
    if (!venue) return alert("Enter event venue");
    if (isNaN(lat) || isNaN(lon)) return alert("Enter valid latitude and longitude");
    if (!category) return alert("Select event category");
    if (!startDate || !endDate) return alert("Enter event start/end date");
    if (!startTime || !endTime) return alert("Enter event start/end time");

    try {
      const user = auth.currentUser;
      if (!user) return alert("Please login first");
      const token = await getIdToken(user, true);
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          venue,
          lat,
          lon,
          category,
          startDate,
          startTime,
          endDate,
          endTime,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }
      alert("Event created!");
      titleEl.value = "";
      descEl.value = "";
      venueEl.value = "";
      latEl.value = "";
      lonEl.value = "";
      categoryEl.value = "";
      startDateEl.value = "";
      startTimeEl.value = "";
      endDateEl.value = "";
      endTimeEl.value = "";
      viewTabBtn.click();
    } catch (err) {
      alert("Error creating event: " + err.message);
    }
  });

  function doesEventOverlapFilter(ev, fs, fe) {
    const evStart = ev.startDate || ev.date || "";
    const evEnd = ev.endDate || ev.date || "";
    if (!fs && !fe) return true;
    if (!evStart || !evEnd) return false;
    if (fs && !fe) return evEnd >= fs;
    if (!fs && fe) return evStart <= fe;
    return evEnd >= fs && evStart <= fe;
  }

  //  Modified loadEvents() – can also show likedOnly if needed
  async function loadEvents(page = 1, likedOnly = false) {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) {
        eventsDiv.innerHTML = `<p>Error loading events (${res.status})</p>`;
        return;
      }
      let events = await res.json();
      eventsDiv.innerHTML = "";
      const filterCategory = filterCategoryEl?.value || "";
      const filterStart = filterStartDateEl?.value || "";
      const filterEnd = filterEndDateEl?.value || "";
      const curUid = auth.currentUser ? auth.currentUser.uid : null;

      const filteredEvents = events.filter(ev =>
        (!filterCategory || (ev.category && ev.category === filterCategory)) &&
        doesEventOverlapFilter(ev, filterStart, filterEnd) &&
        (!likedOnly || (ev.likedBy && curUid && ev.likedBy[curUid]))
      );

      if (!filteredEvents.length) {
        eventsDiv.innerHTML = likedOnly
          ? "<p>You haven't liked any events yet.</p>"
          : "<p>No events found for this filter.</p>";
        clearMapMarkers();
        return;
      }

      filteredEvents.sort((a, b) => {
        const ta = formatTimestamp(a.createdAt).getTime();
        const tb = formatTimestamp(b.createdAt).getTime();
        return tb - ta;
      });

      const totalItems = filteredEvents.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;
      currentPage = page;
      clearMapMarkers();

      filteredEvents.forEach(ev => {
        if (ev.lat && ev.lon && map) {
          const marker = new google.maps.Marker({
            position: { lat: ev.lat, lng: ev.lon },
            map: map,
            title: ev.title,
            icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
          });
          const owner = ev.userEmail || ev.userId || "unknown";
          const createdAt = formatTimestamp(ev.createdAt);
          const when = isNaN(createdAt.getTime()) ? "" : createdAt.toLocaleString();
          const infoWindow = new google.maps.InfoWindow({
            content:
              `<strong>${escapeHtml(ev.title)}</strong><br>${escapeHtml(ev.description)}<br><strong>Venue:</strong> ${escapeHtml(ev.venue || "")}<br><strong>Category:</strong> ${escapeHtml(ev.category || "-")}<br><strong>Start:</strong> ${escapeHtml(ev.startDate || ev.date || "-")} <strong>Time:</strong> ${formatTimeAMPM(ev.startTime || "-")}<br><strong>End:</strong> ${escapeHtml(ev.endDate || ev.date || "-")} <strong>Time:</strong> ${formatTimeAMPM(ev.endTime || "-")}<br><small>by ${escapeHtml(owner)} ${when ? "• " + when : ""}</small>`
          });
          marker.addListener("click", () => infoWindow.open(map, marker));
          eventMarkers.push(marker);
        }
      });

      const start = (page - 1) * itemsPerPage;
      const pagedEvents = filteredEvents.slice(start, start + itemsPerPage);
      for (const ev of pagedEvents) {
        const createdAt = formatTimestamp(ev.createdAt);
        const when = isNaN(createdAt.getTime()) ? "" : createdAt.toLocaleString();
        const owner = ev.userEmail || ev.userId || "unknown";
        const card = document.createElement("div");
        card.className = "event-card";
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
              <strong>${escapeHtml(ev.title || "Untitled")}</strong>
              <div style="color:#333; margin-top:6px;">${escapeHtml(ev.description || "")}</div>
              <div style="margin-top:6px;"><strong>Venue:</strong> ${escapeHtml(ev.venue || "N/A")}</div>
              <div style="margin-top:6px;"><strong>Category:</strong> ${escapeHtml(ev.category || "-")}</div>
              <div style="margin-top:6px;">
                <strong>Start date:</strong> ${escapeHtml(ev.startDate || "-")}
                <strong>Time:</strong> ${formatTimeAMPM(ev.startTime || "-")}
              </div>
              <div style="margin-top:6px;">
                <strong>End date:</strong> ${escapeHtml(ev.endDate || "-")}
                <strong>Time:</strong> ${formatTimeAMPM(ev.endTime || "-")}
              </div>
              <div style="margin-top:6px;"><small>by ${escapeHtml(owner)} ${when ? "• " + when : ""}</small></div>
            </div>
            <div style="margin-left:12px; display:flex; flex-direction:column; gap:6px; align-items:flex-end;"></div>
          </div>
        `;
        const btnContainer = card.querySelector("div > div:last-child");

        const likeBtn = document.createElement("button");
        likeBtn.className = "heart-btn";
        likeBtn.style.fontSize = "14px";
        likeBtn.style.padding = "2px 4px";
        likeBtn.style.width = "26px";
        likeBtn.style.height = "26px";
        likeBtn.style.lineHeight = "1";
        likeBtn.innerHTML = (ev.likedBy && ev.likedBy[curUid]) ? "❤️" : "🤍";
        likeBtn.addEventListener("click", async () => {
          try {
            const token = await getIdToken(auth.currentUser, true);
            const res = await fetch(`/api/events/${ev.id}/like`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
            });
            const data = await res.json();
            if (res.ok) likeBtn.innerHTML = data.liked ? "❤️" : "🤍";
            else alert("Failed to toggle like: " + (data.error || res.status));
          } catch (err) {
            alert("Like failed: " + err.message);
          }
        });
        btnContainer.appendChild(likeBtn);

        if (curUid && ev.userId && ev.userId === curUid) {
          const delBtn = document.createElement("button");
          delBtn.className = "danger";
          delBtn.textContent = "Delete";
          delBtn.style.width = "80px";
          delBtn.addEventListener("click", async () => {
            if (!confirm("Delete this event?")) return;
            try {
              const token = await getIdToken(auth.currentUser, true);
              const resp = await fetch(`/api/events/${ev.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!resp.ok) throw new Error(await resp.text());
              alert("Event deleted");
              loadEvents(currentPage, likedOnly);
            } catch (err) {
              alert("Delete failed: " + err.message);
            }
          });
          btnContainer.appendChild(delBtn);

         
        }

        eventsDiv.appendChild(card);
      }

      eventsDiv.appendChild(prevBtn);
      eventsDiv.appendChild(nextBtn);
      prevBtn.disabled = page === 1;
      nextBtn.disabled = page >= totalPages;

      if (filteredEvents.length && map) {
        const bounds = new google.maps.LatLngBounds();
        filteredEvents.forEach(ev => {
          if (ev.lat && ev.lon) bounds.extend({ lat: ev.lat, lng: ev.lon });
        });
        map.fitBounds(bounds);
      }
    } catch (err) {
      eventsDiv.innerHTML = `<p>Error: ${err.message}</p>`;
      console.error("loadEvents error:", err);
    }
  }

  applyFiltersBtn?.addEventListener("click", () => loadEvents(1));

  //  New: Show only liked events
  viewLikedEventsBtn?.addEventListener("click", async () => {
  try {
    const user = auth.currentUser;
    if (!user) return alert("Please login first to view recommendations.");

    const token = await getIdToken(user, true);
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error("Failed to fetch events.");

    const allEvents = await res.json();

    // Step 1: Get events liked by current user
    const likedEvents = allEvents.filter(
      (ev) => ev.likedBy && ev.likedBy[user.uid]
    );

    if (!likedEvents.length) {
      eventsDiv.innerHTML = "<p>You haven't liked any events yet.</p>";
      clearMapMarkers();
      return;
    }

    // Step 2: Collect all liked categories
    const likedCategories = new Set(
      likedEvents
        .map((ev) => ev.category?.toLowerCase().trim())
        .filter(Boolean)
    );

    // Step 3: Get all events that belong to liked categories
    const sameCategoryEvents = allEvents.filter(
      (ev) =>
        ev.category &&
        likedCategories.has(ev.category.toLowerCase().trim()) &&
        !(ev.likedBy && ev.likedBy[user.uid]) // avoid duplicates of liked events
    );

    // Step 4: Merge liked + same-category events
    const recommendedEvents = [...likedEvents, ...sameCategoryEvents];

    // Step 5: Show recommended events on map and list
    eventsDiv.innerHTML = "";
    clearMapMarkers();

    recommendedEvents.forEach((ev) => {
      if (ev.lat && ev.lon && map) {
        const marker = new google.maps.Marker({
  position: { lat: ev.lat, lng: ev.lon },
  map: map,
  title: ev.title,
  icon: ev.likedBy && ev.likedBy[user.uid]
    ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png" // liked
    : "http://maps.google.com/mapfiles/ms/icons/green-dot.png", // similar-category
});

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <strong>${escapeHtml(ev.title)}</strong><br>
            ${escapeHtml(ev.description || "")}<br>
            <strong>Venue:</strong> ${escapeHtml(ev.venue || "")}<br>
            <strong>Category:</strong> ${escapeHtml(ev.category || "-")}<br>
            <strong>Start:</strong> ${escapeHtml(ev.startDate || "-")} ${formatTimeAMPM(ev.startTime || "-")}<br>
            <strong>End:</strong> ${escapeHtml(ev.endDate || "-")} ${formatTimeAMPM(ev.endTime || "-")}
          `,
        });

        marker.addListener("click", () => infoWindow.open(map, marker));
        eventMarkers.push(marker);
      }

      const card = document.createElement("div");
      card.className = "event-card";
      card.style.borderLeft = ev.likedBy && ev.likedBy[user.uid] ? "4px solid red" : "4px red green";
      card.innerHTML = `
        <strong>${escapeHtml(ev.title || "Untitled")}</strong><br>
        ${escapeHtml(ev.description || "")}<br>
        <strong>Venue:</strong> ${escapeHtml(ev.venue || "")}<br>
        <strong>Category:</strong> ${escapeHtml(ev.category || "-")}<br>
        <strong>Start:</strong> ${escapeHtml(ev.startDate || "-")} ${formatTimeAMPM(ev.startTime || "-")}<br>
        <strong>End:</strong> ${escapeHtml(ev.endDate || "-")} ${formatTimeAMPM(ev.endTime || "-")}<br>
        ${
          ev.likedBy && ev.likedBy[user.uid]
            ? "<em style='color:red'>(You liked this event)</em>"
            : "<em style='color:red'>(Similar category)</em>"
        }
      `;
      eventsDiv.appendChild(card);
    });
    




    // Step 6: Adjust map bounds
    if (recommendedEvents.length && map) {
      const bounds = new google.maps.LatLngBounds();
      recommendedEvents.forEach((ev) => {
        if (ev.lat && ev.lon) bounds.extend({ lat: ev.lat, lng: ev.lon });
      });
      map.fitBounds(bounds);
    }

  } catch (err) {
    console.error("Error showing recommendations:", err);
    alert("Error showing recommendations: " + err.message);
  }
});


});
