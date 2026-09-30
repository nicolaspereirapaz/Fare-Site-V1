"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { Building2, Check, UserRound } from "lucide-react";
import { BRAZILIAN_STATES, formatCep, formatCnpj, formatCpf, formatPhoneBR } from "@/lib/account/documents";
import { toCustomerProfile, type AccountProfileData, type CustomerAddress, type CustomerProfile, type ProfileErrors } from "@/lib/account/profile";
import { lookupCep } from "@/lib/account/profileClient";

type FieldKey = keyof ProfileErrors;

function Field({
  id, label, error, children, className,
}: { id: string; label: string; error?: string; children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode; className?: string }) {
  const errorId = `${id}-error`;
  return (
    <div className={`profile-field ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, ...(error ? { "aria-invalid": true as const, "aria-describedby": errorId } : {}) })}
      {error ? <small className="profile-field-error" id={errorId}>{error}</small> : null}
    </div>
  );
}

export function AccountProfileForm({ initial }: { initial: AccountProfileData }) {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile>(() => toCustomerProfile(initial));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [cepState, setCepState] = useState<"idle" | "loading" | "notfound">("idle");
  const pj = profile.personType === "pj";

  const clear = (key: FieldKey) => {
    setState("idle");
    setFormError(null);
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const set = <K extends keyof CustomerProfile>(key: K, value: CustomerProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    clear(key as FieldKey);
  };
  const setAddress = (key: keyof CustomerAddress, value: string) => {
    setProfile((current) => ({ ...current, address: { ...current.address, [key]: value } }));
    clear(key);
  };

  async function changeCep(value: string) {
    const cep = formatCep(value);
    setAddress("cep", cep);
    setCepState("idle");
    if (cep.length !== 9) return;
    setCepState("loading");
    const found = await lookupCep(cep);
    if (!found) {
      setCepState("notfound");
      return;
    }
    setCepState("idle");
    setProfile((current) => ({
      ...current,
      address: {
        ...current.address,
        street: found.street || current.address.street,
        district: found.district || current.address.district,
        city: found.city || current.address.city,
        state: found.state || current.address.state,
      },
    }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of ["street", "district", "city", "state"] as const) delete next[key];
      return next;
    });
  }

  function changePersonType(personType: CustomerProfile["personType"]) {
    if (personType === profile.personType) return;
    setProfile((current) => ({ ...current, personType, document: "" }));
    setErrors({});
    setFormError(null);
    setState("idle");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setFormError(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) {
        setState("idle");
        setErrors(data.errors ?? {});
        setFormError(data.errors ? "Confira os campos destacados." : "Não foi possível salvar agora. Tente de novo.");
        return;
      }
      setProfile(toCustomerProfile(data as AccountProfileData));
      setErrors({});
      setState("saved");
      router.refresh(); // atualiza o "Olá, …" e o aviso de cadastro incompleto
    } catch {
      setState("idle");
      setFormError("Não foi possível salvar agora. Tente de novo.");
    }
  }

  const exempt = profile.stateRegistration === "ISENTO";

  return (
    <form className="account-form profile-form" noValidate onSubmit={save}>
      <fieldset className="profile-type">
        <legend>Tipo de cadastro</legend>
        <label className={!pj ? "active" : undefined}>
          <input checked={!pj} name="personType" onChange={() => changePersonType("pf")} type="radio" value="pf" />
          <UserRound aria-hidden="true" size={19} />
          Pessoa física
        </label>
        <label className={pj ? "active" : undefined}>
          <input checked={pj} name="personType" onChange={() => changePersonType("pj")} type="radio" value="pj" />
          <Building2 aria-hidden="true" size={19} />
          Pessoa jurídica
        </label>
      </fieldset>

      {pj ? (
        <section className="profile-section">
          <h2>Empresa</h2>
          <div className="profile-grid">
            <Field error={errors.document} id="profile-document" label="CNPJ">
              {(p) => <input {...p} autoComplete="off" inputMode="text" onChange={(e) => set("document", formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" value={profile.document} />}
            </Field>
            <Field className="profile-ie" error={errors.stateRegistration} id="profile-ie" label="Inscrição estadual">
              {(p) => (
                <div className="profile-ie-row">
                  <input {...p} disabled={exempt} maxLength={20} onChange={(e) => set("stateRegistration", e.target.value.toUpperCase())} value={profile.stateRegistration} />
                  <label className="profile-check">
                    <input checked={exempt} onChange={(e) => set("stateRegistration", e.target.checked ? "ISENTO" : "")} type="checkbox" />
                    Isento
                  </label>
                </div>
              )}
            </Field>
            <Field className="span-2" error={errors.companyName} id="profile-company" label="Razão social">
              {(p) => <input {...p} autoComplete="organization" maxLength={160} onChange={(e) => set("companyName", e.target.value)} value={profile.companyName} />}
            </Field>
            <Field className="span-2" error={errors.tradeName} id="profile-trade" label="Nome fantasia (opcional)">
              {(p) => <input {...p} maxLength={160} onChange={(e) => set("tradeName", e.target.value)} value={profile.tradeName} />}
            </Field>
          </div>
        </section>
      ) : null}

      <section className="profile-section">
        <h2>{pj ? "Responsável e contato" : "Seus dados"}</h2>
        <div className="profile-grid">
          <Field className="span-2" error={errors.name} id="profile-name" label={pj ? "Nome do responsável" : "Nome completo"}>
            {(p) => <input {...p} autoComplete="name" maxLength={120} onChange={(e) => set("name", e.target.value)} value={profile.name} />}
          </Field>
          {!pj ? (
            <Field error={errors.document} id="profile-document" label="CPF">
              {(p) => <input {...p} autoComplete="off" inputMode="numeric" onChange={(e) => set("document", formatCpf(e.target.value))} placeholder="000.000.000-00" value={profile.document} />}
            </Field>
          ) : null}
          <Field error={errors.phone} id="profile-phone" label="Telefone / WhatsApp">
            {(p) => <input {...p} autoComplete="tel-national" inputMode="tel" onChange={(e) => set("phone", formatPhoneBR(e.target.value))} placeholder="(11) 98888-7777" value={profile.phone} />}
          </Field>
          <div className={`profile-field ${pj ? "" : "span-2"}`}>
            <label htmlFor="profile-email">E-mail</label>
            <input aria-describedby="profile-email-hint" id="profile-email" readOnly tabIndex={-1} value={initial.email} />
            <small className="profile-field-hint" id="profile-email-hint">É o e-mail de acesso; não pode ser alterado aqui.</small>
          </div>
        </div>
      </section>

      <section className="profile-section">
        <h2>{pj ? "Endereço da empresa" : "Endereço"}</h2>
        <div className="profile-grid profile-grid-address">
          <Field error={errors.cep} id="profile-cep" label="CEP">
            {(p) => (
              <>
                <input {...p} autoComplete="postal-code" inputMode="numeric" onChange={(e) => void changeCep(e.target.value)} placeholder="00000-000" value={profile.address.cep} />
                {cepState === "loading" ? <small className="profile-field-hint">Buscando endereço…</small> : null}
                {cepState === "notfound" ? <small className="profile-field-hint">CEP não encontrado; preencha o endereço abaixo.</small> : null}
              </>
            )}
          </Field>
          <Field className="span-3" error={errors.street} id="profile-street" label="Rua">
            {(p) => <input {...p} autoComplete="address-line1" maxLength={160} onChange={(e) => setAddress("street", e.target.value)} value={profile.address.street} />}
          </Field>
          <Field error={errors.number} id="profile-number" label="Número">
            {(p) => <input {...p} maxLength={20} onChange={(e) => setAddress("number", e.target.value)} value={profile.address.number} />}
          </Field>
          <Field className="span-3" error={errors.complement} id="profile-complement" label="Complemento (opcional)">
            {(p) => <input {...p} autoComplete="address-line2" maxLength={80} onChange={(e) => setAddress("complement", e.target.value)} placeholder="Sala, bloco, apto…" value={profile.address.complement} />}
          </Field>
          <Field className="span-2" error={errors.district} id="profile-district" label="Bairro">
            {(p) => <input {...p} maxLength={80} onChange={(e) => setAddress("district", e.target.value)} value={profile.address.district} />}
          </Field>
          <Field error={errors.city} id="profile-city" label="Cidade">
            {(p) => <input {...p} autoComplete="address-level2" maxLength={80} onChange={(e) => setAddress("city", e.target.value)} value={profile.address.city} />}
          </Field>
          <Field error={errors.state} id="profile-state" label="Estado">
            {(p) => (
              <select {...p} autoComplete="address-level1" onChange={(e) => setAddress("state", e.target.value)} value={profile.address.state}>
                <option value="">UF</option>
                {BRAZILIAN_STATES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            )}
          </Field>
        </div>
      </section>

      {formError ? <p className="auth-error" role="alert">{formError}</p> : null}

      <div className="account-form-actions">
        <button className="button button-primary" disabled={state === "saving"} type="submit">
          {state === "saving" ? "Salvando…" : "Salvar cadastro"}
        </button>
        <span aria-live="polite" className="account-form-saved" role="status">
          {state === "saved" ? <><Check aria-hidden="true" size={17} /> Cadastro salvo</> : null}
        </span>
      </div>
      <p className="account-form-note">Esses dados já vêm preenchidos quando você finaliza um pedido.</p>
    </form>
  );
}
