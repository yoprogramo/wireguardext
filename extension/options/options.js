// options.js — Lógica de la página de configuración: CRUD de perfiles.
import * as storage from "../lib/storage.js";
import { validateProfile } from "../lib/validate.js";
import { importConfFiles, profileToConf } from "../lib/conf.js";

// --- Referencias del DOM ---
const $ = (id) => document.getElementById(id);
const profileList = $("profile-list");
const emptyHint = $("empty-hint");
const formSection = $("form-section");
const formTitle = $("form-title");
const form = $("profile-form");

// --- Render de la lista ---

async function renderList() {
  const profiles = await storage.getProfiles();
  profileList.innerHTML = "";
  emptyHint.classList.toggle("hidden", profiles.length > 0);

  for (const p of profiles) {
    const li = document.createElement("li");
    li.className = "profile-item";

    const info = document.createElement("div");
    info.innerHTML = `
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="meta">${escapeHtml(p.peer?.endpoint ?? "")} · ${escapeHtml(p.interface?.address ?? "")}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => startEdit(p));

    const exportBtn = document.createElement("button");
    exportBtn.className = "btn btn-sm";
    exportBtn.textContent = "Exportar";
    exportBtn.title = "Descargar como .conf";
    exportBtn.addEventListener("click", () => exportProfile(p));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-danger";
    delBtn.textContent = "Eliminar";
    delBtn.addEventListener("click", () => removeProfile(p));

    actions.append(editBtn, exportBtn, delBtn);
    li.append(info, actions);
    profileList.append(li);
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

// --- Formulario (alta / edición) ---

function showForm(profile) {
  // Rellenar campos.
  $("id").value = profile?.id ?? "";
  $("name").value = profile?.name ?? "";
  $("privateKey").value = profile?.interface?.privateKey ?? "";
  $("address").value = profile?.interface?.address ?? "";
  $("dns").value = profile?.interface?.dns ?? "";
  $("mtu").value = profile?.interface?.mtu ?? "";
  $("publicKey").value = profile?.peer?.publicKey ?? "";
  $("endpoint").value = profile?.peer?.endpoint ?? "";
  $("allowedIPs").value = profile?.peer?.allowedIPs ?? "";
  $("presharedKey").value = profile?.peer?.presharedKey ?? "";
  $("persistentKeepalive").value = profile?.peer?.persistentKeepalive ?? "";

  formTitle.textContent = profile ? "Editar perfil" : "Nuevo perfil";
  formSection.classList.remove("hidden");
  clearErrors();
  $("name").focus();
}

function hideForm() {
  formSection.classList.add("hidden");
  form.reset();
  clearErrors();
}

function clearErrors() {
  for (const el of form.querySelectorAll(".error")) el.textContent = "";
  for (const el of form.querySelectorAll("input.invalid")) el.classList.remove("invalid");
}

function showErrors(errors) {
  clearErrors();
  for (const [field, msg] of Object.entries(errors)) {
    const small = form.querySelector(`.error[data-for="${field}"]`);
    const input = $(field);
    if (small) small.textContent = msg;
    if (input) input.classList.add("invalid");
  }
}

function readForm() {
  return {
    id: $("id").value || undefined,
    name: $("name").value.trim(),
    interface: {
      privateKey: $("privateKey").value.trim(),
      address: $("address").value.trim(),
      dns: $("dns").value.trim(),
      mtu: $("mtu").value ? Number($("mtu").value) : 0,
    },
    peer: {
      publicKey: $("publicKey").value.trim(),
      endpoint: $("endpoint").value.trim(),
      allowedIPs: $("allowedIPs").value.trim(),
      presharedKey: $("presharedKey").value.trim(),
      persistentKeepalive: $("persistentKeepalive").value ? Number($("persistentKeepalive").value) : 0,
    },
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = readForm();

  const { valid, errors } = validateProfile(data);
  if (!valid) {
    showErrors(errors);
    return;
  }

  if (data.id) {
    await storage.updateProfile(data);
  } else {
    delete data.id;
    await storage.addProfile(data);
  }
  hideForm();
  await renderList();
});

$("btn-cancel").addEventListener("click", hideForm);
$("btn-new").addEventListener("click", () => showForm(null));

function startEdit(profile) {
  showForm(profile);
}

async function removeProfile(profile) {
  if (!confirm(`¿Eliminar el perfil «${profile.name}»?`)) return;
  await storage.deleteProfile(profile.id);
  await renderList();
}

// --- Importar .conf ---

$("btn-import").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  if (files.length === 0) return;
  await doImport(files);
  e.target.value = ""; // permite reimportar el mismo fichero
});

/** Soporta drag & drop sobre la lista de perfiles. */
const listEl = $("profile-list");
listEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  listEl.classList.add("drag");
});
listEl.addEventListener("dragleave", () => listEl.classList.remove("drag"));
listEl.addEventListener("drop", async (e) => {
  e.preventDefault();
  listEl.classList.remove("drag");
  const files = [...e.dataTransfer.files].filter((f) => /\.conf$/i.test(f.name));
  if (files.length === 0) return;
  await doImport(files);
});

async function doImport(files) {
  const results = await importConfFiles(files);
  let ok = 0;
  const failed = [];
  for (const r of results) {
    if (r.profile) {
      await storage.addProfile(r.profile);
      ok++;
    } else {
      failed.push(`${r.file}: ${r.error}`);
    }
  }
  await renderList();
  if (failed.length > 0) {
    alert(`Importados ${ok} perfil(es).\n\nNo se pudieron importar ${failed.length}:\n\n${failed.join("\n")}`);
  }
}

// --- Exportar .conf ---

function exportProfile(profile) {
  const conf = profileToConf(profile);
  const blob = new Blob([conf], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(profile.name || "perfil") + ".conf";
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "perfil";
}

// --- Init ---
renderList();
