<script type="ts">
  import { link } from "svelte-spa-router";
</script>

<header>
  <img src="favicon.png" alt="">
  <h3>pgifer</h3>
  <a href="/" use:link>Home</a>
  <a href="/about" use:link>About</a>
</header>

<hr>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  img {
    width: 32px;
    height: 32px;
    border-radius: 6px;
  }
</style>