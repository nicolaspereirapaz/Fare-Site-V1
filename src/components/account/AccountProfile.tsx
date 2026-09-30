export function AccountProfile({ user }: { user: { name: string; email: string } }) {
  return (
    <dl className="account-profile">
      <div><dt>Nome</dt><dd>{user.name}</dd></div>
      <div><dt>E-mail</dt><dd>{user.email}</dd></div>
    </dl>
  );
}
