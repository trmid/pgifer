<script lang="ts">
	import Router from "svelte-spa-router";
  import Footer from "./components/Footer.svelte";
  import Header from "./components/Header.svelte";
  import { routes } from "./routes";
</script>

<!-- Main -->
<main>

  <!-- Header -->
  <Header />

  <!-- Router -->
	<Router {routes}/>

  <!-- Footer -->
  <Footer />

</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
  }

  main {
    max-width: 1024px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>